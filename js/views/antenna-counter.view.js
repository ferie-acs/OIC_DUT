// Lot d3 : saisie d'un DUT au guichet de l'antenne pour un usager (partenaire habilité ou transporteur).
import { icon } from '../core/icons.js';
import { escapeHtml, formatDate } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { getCurrentUser } from '../core/auth.js';
import { toast } from '../core/ui.js';
import { DUT_STATUS_LABELS } from '../core/constants.js';
import * as lifecycle from '../services/dut-lifecycle.service.js';

export function render(container) {
  const user = getCurrentUser();
  const usagers = lifecycle.counterUsagers();
  const drafts = lifecycle.counterDrafts(user);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <span class="overline">Antenne · ${escapeHtml(user.antennaName || '')}</span>
        <h1>Saisie au guichet</h1>
        <div class="subtitle">Établissez le DUT d’un usager qui se présente à l’antenne. Un autre agent le validera.</div>
      </div>
    </div>
    <div class="page-header-rule"></div>

    <div class="lc-two-cols">
      <form class="card" id="counter-form" novalidate>
        <div class="card-header"><div><h3>Nouvelle saisie</h3><div class="subtitle">Identifiez l’usager et la personne qui dépose la demande</div></div></div>
        <div class="field">
            <label for="c-type">Type d’usager <span class="req">*</span></label>
            <div class="select-wrap"><select class="select" id="c-type">
              <option value="PARTENAIRE">Partenaire habilité</option>
              <option value="TRANSPORTEUR">Transporteur (règlement par référence)</option>
            </select>${icon('chevronDown', { size: 14 })}</div>
          </div>
          <div class="field">
            <label for="c-usager">Usager <span class="req">*</span></label>
            <div class="select-wrap"><select class="select" id="c-usager"></select>${icon('chevronDown', { size: 14 })}</div>
          </div>
          <div class="field">
            <label for="c-nom">Nom et prénoms du déposant <span class="req">*</span></label>
            <input class="input" id="c-nom" maxlength="120" autocomplete="off">
          </div>
          <div class="field">
            <label for="c-piece">Pièce d’identité du déposant <span class="req">*</span></label>
            <input class="input" id="c-piece" maxlength="60" placeholder="Type et numéro" autocomplete="off">
          </div>
        <div class="field">
          <label for="c-tel">Téléphone du déposant</label>
          <input class="input" id="c-tel" maxlength="40" autocomplete="off">
        </div>
        <p class="hint" id="c-hint"></p>
        <p class="ta-error" role="alert" id="c-error"></p>
        <div class="row gap-2" style="justify-content:flex-end;margin-top:var(--s3)">
          <button type="submit" class="btn btn-primary">${icon('plus', { size: 15 })} Commencer la saisie</button>
        </div>
      </form>

      <div class="card" style="padding:0">
        <div class="card-header" style="padding:22px 22px 0">
          <div><h3>Saisies de l’antenne</h3><div class="subtitle">Cliquez sur une ligne pour ouvrir le dossier</div></div>
        </div>
        <div class="table-wrap"><table class="data-table" id="counter-table"></table></div>
      </div>
    </div>
  `;

  const typeSelect = container.querySelector('#c-type');
  const usagerSelect = container.querySelector('#c-usager');
  const hint = container.querySelector('#c-hint');
  const fillUsagers = () => {
    const list = typeSelect.value === 'TRANSPORTEUR' ? usagers.transporteurs : usagers.partenaires;
    usagerSelect.innerHTML = list.length
      ? list.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)}</option>`).join('')
      : '<option value="">Aucun usager disponible</option>';
    hint.textContent = typeSelect.value === 'TRANSPORTEUR'
      ? 'Le DUT sera réglé au guichet avec une référence du stock du transporteur (débit simulé).'
      : 'Le numéro sera pris sur la plage du partenaire au moment de la validation.';
  };
  typeSelect.addEventListener('change', fillUsagers);
  fillUsagers();

  container.querySelector('#counter-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const dut = lifecycle.createCounterDraft(user, {
        usagerType: typeSelect.value, usagerId: usagerSelect.value,
        deposantNom: container.querySelector('#c-nom').value, deposantPiece: container.querySelector('#c-piece').value,
        deposantTelephone: container.querySelector('#c-tel').value,
      });
      sessionStorage.setItem('dut_wizard_draft_id', dut.id);
      toast({ type: 'success', title: 'Saisie ouverte', desc: `DUT pour ${dut.guichet.usagerName}` });
      navigate('/dut/new/1');
    } catch (err) { container.querySelector('#c-error').textContent = err.message; }
  });

  const table = container.querySelector('#counter-table');
  if (!drafts.length) {
    table.innerHTML = `<tr><td class="table-empty">${icon('inbox', { size: 32 })}<div>Aucune saisie au guichet pour le moment</div></td></tr>`;
    return;
  }
  table.innerHTML = `
    <thead><tr><th scope="col">Date</th><th scope="col">Usager</th><th scope="col">Saisi par</th><th scope="col">État</th><th scope="col" class="text-right">Actions</th></tr></thead>
    <tbody>${drafts.map((d) => `
      <tr data-id="${escapeHtml(d.id)}">
        <td>${formatDate(d.createdAt)}</td>
        <td>${escapeHtml(d.guichet.usagerName)}</td>
        <td>${escapeHtml(d.guichet.agentName)}</td>
        <td><span class="badge status-${d.status}"><span class="badge-dot"></span>${DUT_STATUS_LABELS[d.status]}</span></td>
        <td class="text-right">${d.status === 'EN_EDITION' && d.createdBy === user.id ? '<button type="button" class="btn btn-ghost btn-sm" data-continue>' + icon('edit', { size: 14 }) + ' Continuer</button>' : '<span class="link-action">Ouvrir</span>'}</td>
      </tr>`).join('')}</tbody>`;
  table.querySelector('tbody').addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (!tr) return;
    if (e.target.closest('[data-continue]')) {
      sessionStorage.setItem('dut_wizard_draft_id', tr.dataset.id);
      navigate('/dut/new/1');
      return;
    }
    navigate(`/antenna/dut/${tr.dataset.id}`);
  });
}
