// Lot d1 : écrans de compte — activation, mot de passe oublié, boîte de réception simulée (espace public),
// « Mon profil » et « Mes messages » (tous les rôles connectés).
import { icon } from '../core/icons.js';
import { navigate } from '../core/router.js';
import { toast } from '../core/ui.js';
import { ROLE_LABELS } from '../core/constants.js';
import { activateAccount, requestPasswordReset, completePasswordReset, changePassword, myProfile, updateMyProfile, RESET_MINUTES } from '../services/account.service.js';
import { myMessages, simulatedInbox } from '../services/messaging.service.js';
import { esc, formatDateTime, pageHeader, field, identity, empty, accountBadge, accountState, simulatedNote } from './d1-ui.js';

const brand = (title, text) => `<div class="auth-brand"><img src="assets/images/oic-officiel.jpeg" alt="OIC — Office Ivoirien des Chargeurs"><div><h2>${esc(title)}</h2><p>${esc(text)}</p></div></div>`;
const passwordFields = (prefix = '') => `
  <div class="field"><label for="${prefix}pwd">Nouveau mot de passe</label><input class="input" type="password" id="${prefix}pwd" name="password" autocomplete="new-password" required minlength="8"><small class="hint">8 caractères au moins, dont une lettre et un chiffre.</small></div>
  <div class="field"><label for="${prefix}pwd2">Confirmer le mot de passe</label><input class="input" type="password" id="${prefix}pwd2" name="confirm" autocomplete="new-password" required></div>`;
const errorBox = '<div class="error-msg hidden" role="alert">' + icon('alertCircle', { size: 13 }) + ' <span></span></div>';
const backLinks = (extra = '') => `<div class="d1-auth-links"><a href="#/login">${icon('chevronLeft', { size: 14 })} Retour à la connexion</a>${extra}</div>`;

function bindForm(container, selector, handler) {
  const form = container.querySelector(selector);
  const box = form.querySelector('.error-msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true; box.classList.add('hidden');
    try { await handler(Object.fromEntries(new FormData(form)), form); }
    catch (err) { box.querySelector('span').textContent = err.message; box.classList.remove('hidden'); }
    finally { submit.disabled = false; }
  });
}

// ------------------------------------------------------------------ Espace public
export function renderActivation(container, params = {}) {
  container.innerHTML = `${brand('Activer mon compte', 'Premier accès : choisissez votre mot de passe.')}
    <form id="activation-form">
      <div class="field"><label for="act-email">Adresse e-mail du compte</label><input class="input" type="email" id="act-email" name="email" autocomplete="username" required></div>
      <div class="field"><label for="act-code">Code d’activation</label><input class="input" id="act-code" name="code" required value="${esc(params.code || '')}" placeholder="ACT-XXXXX-XXXXX" autocomplete="one-time-code"><small class="hint">Reçu par courriel à l’adresse enregistrée sur votre compte.</small></div>
      ${passwordFields('act-')}
      ${errorBox}
      <button type="submit" class="btn btn-primary btn-block btn-lg">Activer mon compte ${icon('arrowRight', { size: 18 })}</button>
    </form>
    ${backLinks('<a href="#/boite-de-reception">Boîte de réception simulée</a>')}`;
  bindForm(container, '#activation-form', async (v) => {
    const { email } = await activateAccount(v);
    container.innerHTML = `${brand('Compte activé', 'Vous pouvez maintenant vous connecter.')}<div class="alert-banner success">${icon('checkCircle', { size: 18 })}<span>Le compte ${esc(email)} est actif. Un message de confirmation vous a été envoyé.</span></div><a class="btn btn-primary btn-block btn-lg" href="#/login">Se connecter ${icon('arrowRight', { size: 18 })}</a>`;
  });
}

export function renderForgot(container) {
  const step1 = () => {
    container.innerHTML = `${brand('Mot de passe oublié', 'Recevez un code à usage unique à l’adresse enregistrée sur votre compte.')}
      <form id="forgot-form">
        <div class="field"><label for="fg-email">Adresse e-mail de connexion</label><input class="input" type="email" id="fg-email" name="email" autocomplete="username" required></div>
        <p class="demo-hint">Votre compte reste utilisable avec votre mot de passe actuel tant que vous n’en avez pas choisi un nouveau.</p>
        ${errorBox}
        <button type="submit" class="btn btn-primary btn-block btn-lg">Recevoir un code ${icon('send', { size: 17 })}</button>
      </form>
      ${backLinks('<a href="#" id="has-code">J’ai déjà un code</a>')}`;
    container.querySelector('#has-code').addEventListener('click', (e) => { e.preventDefault(); step2(container.querySelector('#fg-email').value); });
    bindForm(container, '#forgot-form', async (v) => { await requestPasswordReset(v.email); step2(v.email, true); });
  };
  const step2 = (address = '', justSent = false) => {
    container.innerHTML = `${brand('Nouveau mot de passe', 'Saisissez le code reçu et choisissez votre nouveau mot de passe.')}
      ${justSent ? `<div class="alert-banner success">${icon('mail', { size: 18 })}<span>Si un compte actif correspond à cette adresse, un code valable ${RESET_MINUTES} minutes vient d’être envoyé à l’adresse enregistrée sur ce compte.</span></div>` : ''}
      <form id="reset-form">
        <div class="field"><label for="rs-email">Adresse e-mail de connexion</label><input class="input" type="email" id="rs-email" name="email" value="${esc(address)}" autocomplete="username" required></div>
        <div class="field"><label for="rs-code">Code reçu</label><input class="input" id="rs-code" name="code" inputmode="numeric" maxlength="6" required autocomplete="one-time-code" placeholder="6 chiffres"></div>
        ${passwordFields('rs-')}
        ${errorBox}
        <button type="submit" class="btn btn-primary btn-block btn-lg">Enregistrer le mot de passe ${icon('check', { size: 17 })}</button>
      </form>
      ${backLinks(`<a href="#/boite-de-reception/${encodeURIComponent(address)}">Boîte de réception simulée</a>`)}`;
    bindForm(container, '#reset-form', async (v) => {
      await completePasswordReset(v);
      container.innerHTML = `${brand('Mot de passe modifié', 'Connectez-vous avec votre nouveau mot de passe.')}<div class="alert-banner success">${icon('checkCircle', { size: 18 })}<span>Votre mot de passe est enregistré. Les sessions ouvertes sur d’autres appareils ont été fermées.</span></div><a class="btn btn-primary btn-block btn-lg" href="#/login">Se connecter ${icon('arrowRight', { size: 18 })}</a>`;
    });
  };
  step1();
}

const messageCard = (m) => `<article class="card d1-message">
  <div class="d1-message-head"><span class="badge ${m.channel === 'SMS' ? 'badge-navy' : 'badge-accent'}">${icon(m.channel === 'SMS' ? 'messageSquare' : 'mail', { size: 12 })} ${esc(m.channelLabel)}</span><span class="text-muted">${formatDateTime(m.createdAt)}</span></div>
  <h3>${esc(m.subject || m.kindLabel)}</h3>
  <small class="text-muted">À : ${esc(m.to)} · ${esc(m.kindLabel)}</small>
  <p class="d1-message-body">${esc(m.body).replace(/\n/g, '<br>')}</p>
  ${m.link ? `<a class="btn btn-secondary btn-sm" href="${esc(m.link)}">${icon('arrowRight', { size: 14 })} Ouvrir le lien</a>` : ''}
</article>`;

export function renderInbox(container, params = {}) {
  const show = (address) => {
    const list = simulatedInbox(address);
    container.querySelector('#inbox-list').innerHTML = address
      ? (list.length ? list.map(messageCard).join('') : `<p class="demo-hint">Aucun message pour ${esc(address)}.</p>`)
      : '';
  };
  container.innerHTML = `${brand('Boîte de réception simulée', 'Démonstration : remplace la messagerie personnelle du titulaire.')}
    <div class="alert-banner info">${icon('info', { size: 16 })}<span>Messages simulés : aucun courriel ni SMS n’est réellement envoyé. En production, ces messages arrivent dans la messagerie de l’utilisateur et cette page n’existe pas.</span></div>
    <form id="inbox-form"><div class="field"><label for="ib-email">Adresse e-mail ou téléphone</label><input class="input" id="ib-email" name="address" required value="${esc(params.address || '')}"></div>
    <button type="submit" class="btn btn-primary btn-block">${icon('inbox', { size: 16 })} Afficher les messages</button></form>
    <div id="inbox-list" class="d1-inbox"></div>
    ${backLinks()}`;
  container.querySelector('#inbox-form').addEventListener('submit', (e) => { e.preventDefault(); show(new FormData(e.target).get('address')); });
  if (params.address) show(params.address);
}

// ------------------------------------------------------------------ Espace connecté
export function renderProfile(root) {
  const me = myProfile();
  const scope = me.partnerName || me.antennaName || me.transporterName || 'National';
  root.innerHTML = `${pageHeader({ overline: 'Mon compte', title: 'Mon profil', subtitle: 'Vos informations de contact et votre mot de passe.' })}
    <div class="sup-grid">
      <div class="sup-main">
        <section class="card"><div class="card-header"><h3>Informations personnelles</h3></div>
          <form id="profile-form" class="workspace-form d1-form">
            <div class="field-row">${field({ name: 'name', label: 'Nom complet', value: me.name, required: true, attrs: 'maxlength="100"' })}${field({ name: 'phone', label: 'Téléphone', value: me.phone || '', type: 'tel', hint: 'Utilisé pour les alertes de sécurité par SMS.' })}</div>
            <p class="error-msg hidden" role="alert"></p>
            <div class="d1-form-actions"><button class="btn btn-primary" type="submit">${icon('check', { size: 15 })} Enregistrer</button></div>
          </form>
        </section>
        <section class="card"><div class="card-header"><h3>Changer mon mot de passe</h3></div>
          <form id="password-form" class="workspace-form d1-form">
            ${field({ name: 'current', label: 'Mot de passe actuel', type: 'password', required: true, attrs: 'autocomplete="current-password"' })}
            <div class="field-row">${field({ name: 'password', label: 'Nouveau mot de passe', type: 'password', required: true, hint: '8 caractères au moins, dont une lettre et un chiffre.', attrs: 'autocomplete="new-password" minlength="8"' })}${field({ name: 'confirm', label: 'Confirmer', type: 'password', required: true, attrs: 'autocomplete="new-password"' })}</div>
            <p class="error-msg hidden" role="alert"></p>
            <div class="d1-form-actions"><button class="btn btn-primary" type="submit">${icon('lock', { size: 15 })} Modifier le mot de passe</button></div>
          </form>
        </section>
      </div>
      <aside class="sup-side">
        <section class="card sup-card-id"><div class="card-header"><h3>Mon compte</h3>${accountBadge(accountState(me))}</div>
          ${identity([['Adresse e-mail', esc(me.email)], ['Rôle', esc(ROLE_LABELS[me.role] || me.role)], ['Rattachement', esc(scope)], ['Compte activé le', me.activatedAt ? formatDateTime(me.activatedAt) : ''], ['Mot de passe modifié le', me.passwordChangedAt ? formatDateTime(me.passwordChangedAt) : '']])}
          <p class="text-muted d1-small">Pour changer d’adresse e-mail, adressez-vous à l’administrateur de votre entreprise ou de l’OIC.</p>
        </section>
        <section class="card"><div class="card-header"><h3>Messages reçus</h3><a href="#/mes-messages">Tout voir</a></div><p class="text-muted d1-small">Activation, sécurité du compte et décisions de l’OIC qui vous concernent.</p></section>
      </aside>
    </div>`;
  const bind = (sel, fn) => {
    const form = root.querySelector(sel); const box = form.querySelector('.error-msg');
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); if (!form.reportValidity()) return;
      const btn = form.querySelector('[type=submit]'); btn.disabled = true; box.classList.add('hidden');
      try { await fn(Object.fromEntries(new FormData(form))); } catch (err) { box.textContent = err.message; box.classList.remove('hidden'); } finally { btn.disabled = false; }
    });
  };
  bind('#profile-form', (v) => { updateMyProfile(v); toast({ type: 'success', title: 'Profil enregistré' }); window.dispatchEvent(new HashChangeEvent('hashchange')); });
  bind('#password-form', async (v) => { await changePassword(v); toast({ type: 'success', title: 'Mot de passe modifié', desc: 'Les autres sessions ouvertes ont été fermées.' }); root.querySelector('#password-form').reset(); });
}

export function renderMyMessages(root) {
  const list = myMessages();
  root.innerHTML = `${pageHeader({ overline: 'Mon compte', title: 'Mes messages', subtitle: 'Courriels et SMS que la plateforme vous a adressés.' })}
    ${simulatedNote('Messages simulés : la plateforme de démonstration n’envoie aucun courriel ni SMS réel. Ils sont conservés ici.')}
    <div class="d1-inbox d1-inbox-wide">${list.length ? list.map(messageCard).join('') : empty('inbox', 'Aucun message', 'Les messages qui vous sont adressés apparaîtront ici.')}</div>`;
}

export function goLogin() { navigate('/login'); }
