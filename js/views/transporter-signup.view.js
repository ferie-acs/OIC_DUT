// Lot d1 : inscription en ligne d'une entreprise de transport (espace public).
import { icon } from '../core/icons.js';
import { registerTransporter, DOC_TYPES, PORTEES } from '../services/transporters.service.js';
import { esc, field, readFile } from './d1-ui.js';

export function render(container) {
  container.classList.add('d1-auth-wide');
  container.innerHTML = `<div class="auth-brand"><img src="assets/images/oic-officiel.jpeg" alt="OIC — Office Ivoirien des Chargeurs"><div><h2>Inscrire mon entreprise</h2><p>Transporteur : demandez votre accès à la plateforme DUT.</p></div></div>
    <form id="signup-form" novalidate>
      <p class="wizard-section-label">Entreprise</p>
      ${field({ name: 'name', label: 'Raison sociale', required: true, attrs: 'maxlength="120"' })}
      <div class="field-row">${field({ name: 'rccm', label: 'RCCM', required: true, attrs: 'placeholder="CI-ABJ-2015-B-4521"' })}${field({ name: 'carteTransporteur', label: 'Carte de transporteur', required: true })}</div>
      ${field({ name: 'portee', label: 'Portée de l’activité', options: Object.entries(PORTEES) })}
      <p class="wizard-section-label">Contact</p>
      <div class="field-row">${field({ name: 'contactName', label: 'Responsable', required: true })}${field({ name: 'phone', label: 'Téléphone', type: 'tel', required: true })}</div>
      ${field({ name: 'email', label: 'Adresse e-mail de l’entreprise', type: 'email', required: true, hint: 'Le lien d’activation de votre compte y sera envoyé après validation par l’OIC.' })}
      <div class="field-row">${field({ name: 'address', label: 'Adresse' })}${field({ name: 'city', label: 'Ville', required: true })}</div>
      <p class="wizard-section-label">Pièces justificatives (PDF, PNG ou JPEG, 300 Ko au plus)</p>
      <div class="field"><label>${esc(DOC_TYPES.RCCM)}</label><input class="input" type="file" name="docRccm" accept="application/pdf,image/png,image/jpeg"></div>
      <div class="field"><label>${esc(DOC_TYPES.CARTE_TRANSPORTEUR)}</label><input class="input" type="file" name="docCarte" accept="application/pdf,image/png,image/jpeg"></div>
      <label class="checkbox-row"><input type="checkbox" name="accept" required> Je certifie l’exactitude des informations déclarées.</label>
      <div class="error-msg hidden" role="alert">${icon('alertCircle', { size: 13 })} <span></span></div>
      <button type="submit" class="btn btn-primary btn-block btn-lg">Envoyer ma demande ${icon('send', { size: 17 })}</button>
    </form>
    <div class="d1-auth-links"><a href="#/login">${icon('chevronLeft', { size: 14 })} Retour à la connexion</a></div>`;
  const form = container.querySelector('#signup-form');
  const box = form.querySelector('.error-msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    box.classList.add('hidden');
    if (!form.reportValidity()) return;
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      const docs = [];
      const rc = await readFile(form.elements.docRccm.files[0]); if (rc) docs.push({ type: 'RCCM', ...rc });
      const ct = await readFile(form.elements.docCarte.files[0]); if (ct) docs.push({ type: 'CARTE_TRANSPORTEUR', ...ct });
      const { reference, email } = registerTransporter(values, docs);
      container.innerHTML = `<div class="auth-brand"><img src="assets/images/oic-officiel.jpeg" alt="OIC"><div><h2>Demande enregistrée</h2><p>Référence ${esc(reference)}</p></div></div>
        <div class="alert-banner success">${icon('checkCircle', { size: 18 })}<span>L’OIC va examiner votre dossier. Un accusé de réception a été envoyé à ${esc(email)} (message simulé). Après validation, vous recevrez à cette adresse le lien d’activation de votre compte.</span></div>
        <a class="btn btn-primary btn-block btn-lg" href="#/login">Retour à la connexion</a>
        <div class="d1-auth-links"><a href="#/boite-de-reception/${encodeURIComponent(email)}">Boîte de réception simulée</a></div>`;
    } catch (err) { box.querySelector('span').textContent = err.message; box.classList.remove('hidden'); btn.disabled = false; }
  });
}
