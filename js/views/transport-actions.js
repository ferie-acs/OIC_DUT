// Actions de suivi du transport, partagées par la fiche DUT et le tableau de bord transporteur :
// déclarer l'étape suivante (Chargé → En route → Arrivé → Livré) et signaler un incident, chacune dans une fenêtre.
import { icon } from '../core/icons.js';
import { escapeHtml } from '../core/utils.js';
import { openModal, toast } from '../core/ui.js';
import * as workspace from '../services/workspace.service.js';

const STAGE_KEYS = Object.keys(workspace.STAGES);
const STAGE_ICONS = { LOADED: 'package', DEPARTED: 'truck', ARRIVED: 'pin', DELIVERED: 'checkCircle' };

/** Étape déclarée du transport ; repli « À préparer » si le dossier est hors périmètre. */
export function currentStage(dutId) {
  try { return workspace.dossier(dutId).stage || 'PLANNED'; } catch { return 'PLANNED'; }
}

export function nextStage(dutId) {
  const key = STAGE_KEYS[STAGE_KEYS.indexOf(currentStage(dutId)) + 1];
  return key ? { key, label: workspace.STAGES[key] } : null;
}

export function stageLabel(dutId) {
  return workspace.STAGES[currentStage(dutId)];
}

/**
 * Boutons « Marquer : <étape> » et « Signaler un incident ».
 * L'étape n'avance que sur un DUT valide : sinon le bouton reste visible, désactivé, avec la raison.
 */
export function transportActionsHtml(dut, { compact = false } = {}) {
  if (!workspace.canContribute()) return '';
  const next = nextStage(dut.id);
  const size = compact ? ' btn-sm' : '';
  const id = escapeHtml(dut.id);
  const stageButton = !next
    ? `<span class="badge badge-success ta-done">${icon('checkCircle', { size: 13 })} Livré</span>`
    : dut.status === 'VALIDE'
      ? `<button type="button" class="btn btn-primary${size}" data-transport-advance="${id}">${icon(STAGE_ICONS[next.key] || 'arrowRight', { size: 15 })} Marquer : ${next.label}</button>`
      : `<button type="button" class="btn btn-secondary${size}" disabled title="Le DUT doit être validé pour déclarer les étapes du transport.">${icon(STAGE_ICONS[next.key] || 'arrowRight', { size: 15 })} Marquer : ${next.label}</button>`;
  return `${stageButton}<button type="button" class="btn btn-secondary${size}" data-transport-incident="${id}">${icon('alertTriangle', { size: 15 })} Signaler un incident</button>`;
}

/** Relie les boutons d'un conteneur ; `findDut(id)` renvoie le dossier à jour, `onDone()` rafraîchit l'écran. */
export function bindTransportActions(root, findDut, onDone) {
  root.querySelectorAll('[data-transport-advance]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    openAdvanceModal(findDut(button.dataset.transportAdvance), onDone);
  }));
  root.querySelectorAll('[data-transport-incident]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    openIncidentModal(findDut(button.dataset.transportIncident), onDone);
  }));
}

function routeLine(dut) {
  return `${escapeHtml(dut.dutNumber || dut.general?.immatriculation || 'Dossier')} · ${escapeHtml(dut.trajet?.chargement?.ville || '—')} → ${escapeHtml(dut.trajet?.dechargement?.ville || '—')}`;
}

export function openAdvanceModal(dut, onDone) {
  const next = nextStage(dut.id);
  if (!next) return;
  const current = STAGE_KEYS.indexOf(currentStage(dut.id));
  openModal({
    icon: STAGE_ICONS[next.key] || 'truck',
    title: `Marquer le transport : ${next.label}`,
    confirmLabel: `Confirmer : ${next.label}`,
    bodyHtml: `
      <p class="ta-route">${routeLine(dut)}</p>
      <ol class="ta-stages">${STAGE_KEYS.map((key, i) => `<li class="${i <= current ? 'is-done' : i === current + 1 ? 'is-next' : ''}">${workspace.STAGES[key]}</li>`).join('')}</ol>
      <label class="field">Observation (facultative)
        <textarea class="textarea" id="ta-note" rows="3" maxlength="1000" placeholder="Lieu, quantité livrée, réserves éventuelles…"></textarea>
      </label>
      <p class="ta-hint">L’étape est horodatée et signée de votre nom. Aucune position GPS n’est collectée.</p>
      <p class="ta-error" role="alert"></p>`,
    onConfirm: ({ root, close }) => {
      try {
        workspace.advanceTransport(dut.id, next.key, root.querySelector('#ta-note').value);
        close();
        toast({ type: 'success', title: `Transport : ${next.label}`, desc: 'Étape enregistrée dans ce navigateur.' });
        onDone?.();
      } catch (err) { root.querySelector('.ta-error').textContent = err.message; }
    },
  });
}

export function openIncidentModal(dut, onDone) {
  openModal({
    icon: 'alertTriangle', tone: 'error',
    title: 'Signaler un incident ou une réserve',
    confirmLabel: 'Enregistrer l’incident',
    bodyHtml: `
      <p class="ta-route">${routeLine(dut)}</p>
      <div class="ta-grid">
        <label class="field">Type
          <select class="select" id="ta-type">${workspace.INCIDENT_TYPES.map((t) => `<option>${escapeHtml(t)}</option>`).join('')}</select>
        </label>
        <label class="field">Priorité
          <select class="select" id="ta-severity"><option value="NORMAL">Normale</option><option value="URGENT">Urgente</option></select>
        </label>
      </div>
      <label class="field">Responsable du suivi
        <input class="input" id="ta-assignee" maxlength="100" placeholder="Nom ou équipe en charge">
      </label>
      <label class="field">Faits et réserves
        <textarea class="textarea" id="ta-description" rows="4" maxlength="2000" placeholder="Décrivez le problème constaté"></textarea>
      </label>
      <p class="ta-error" role="alert"></p>`,
    onConfirm: ({ root, close }) => {
      try {
        workspace.addIncident(dut.id, {
          type: root.querySelector('#ta-type').value,
          severity: root.querySelector('#ta-severity').value,
          assignee: root.querySelector('#ta-assignee').value,
          description: root.querySelector('#ta-description').value,
        });
        close();
        toast({ type: 'success', title: 'Incident enregistré', desc: 'Il apparaît dans l’onglet Incidents & réserves du dossier.' });
        onDone?.();
      } catch (err) { root.querySelector('.ta-error').textContent = err.message; }
    },
  });
}
