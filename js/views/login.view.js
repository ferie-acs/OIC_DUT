import { login } from '../core/auth.js';
import { navigate } from '../core/router.js';
import { toast } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { ROLES, DEMO_PASSWORD } from '../core/constants.js';
import { DEMO_ACCOUNTS } from '../seed.js';

const HOME_BY_ROLE = {
  [ROLES.PARTNER_ADMIN]: '/partner/dashboard',
  [ROLES.PARTNER_EDITOR]: '/partner/dashboard',
  [ROLES.ANTENNA_AGENT]: '/antenna/dashboard',
  [ROLES.OIC_ADMIN]: '/oic/dashboard',
  [ROLES.CONTROLLER]: '/control',
  [ROLES.TRANSPORTEUR]: '/transporteur/dashboard',
  [ROLES.CASHIER]: '/caisse/paiements', // Lot d2
};

export function render(container) {
  container.innerHTML = `
    <div class="auth-brand">
      <img src="assets/images/oic-officiel.jpeg" alt="OIC — Office Ivoirien des Chargeurs">
      <div><h2>Bienvenue sur DUT-OIC</h2><p>Connectez-vous à votre espace de transport.</p></div>
    </div>
    <form id="login-form">
      <div class="field">
        <label for="login-email">Adresse e-mail</label>
        <input class="input" type="email" id="login-email" placeholder="nom@demo.oic.ci" autocomplete="username" required>
      </div>
      <div class="field">
        <label for="login-password">Mot de passe</label>
        <div class="input-group password-field">
          <input class="input" type="password" id="login-password" placeholder="Votre mot de passe" autocomplete="current-password" required>
          <button type="button" class="password-toggle" aria-label="Afficher le mot de passe" aria-pressed="false">${icon('eye',{size:19})}</button>
        </div>
        
      </div>
      <div class="error-msg hidden" id="login-error" role="alert">${icon('alertCircle', { size: 13 })} <span></span></div>
      <button type="submit" class="btn btn-primary btn-block btn-lg" style="margin-top:var(--s2)">Se connecter ${icon('arrowRight',{size:18})}</button>
    </form>
    <div class="auth-demo-divider"><span>Explorer la plateforme</span></div>
    <details class="auth-demo-accounts"><summary>Choisir un compte de démonstration ${icon('chevronDown',{size:16})}</summary>
      <p class="demo-hint">Sélectionnez votre rôle pour préremplir la connexion. Mot de passe initial : <strong>${DEMO_PASSWORD}</strong>. Après réinitialisation, utilisez le nouvel accès fourni par votre administrateur.</p>
      ${DEMO_ACCOUNTS.map((acc) => `
        <button type="button" class="demo-account-btn" data-email="${acc.email}">
          <span><strong>${acc.label}</strong><span>${acc.email}</span></span>
          ${icon('chevronRight', { size: 14 })}
        </button>
      `).join('')}
    </details>
    <p class="auth-demo-note">${icon('shield',{size:15})} Environnement de démonstration OIC</p>
  `;

  const emailInput = container.querySelector('#login-email');
  const passwordInput = container.querySelector('#login-password');
  const errorBox = container.querySelector('#login-error');
  container.querySelector('.password-toggle').addEventListener('click', event => {
    const show = passwordInput.type === 'password';
    passwordInput.type = show ? 'text' : 'password';
    event.currentTarget.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    event.currentTarget.setAttribute('aria-pressed', String(show));
  });

  container.querySelectorAll('.demo-account-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      emailInput.value = btn.dataset.email;
      passwordInput.value = DEMO_PASSWORD;
      errorBox.classList.add('hidden');
    });
  });

  container.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit=container.querySelector('[type=submit]');submit.disabled=true;
    try {
      const user = await login(emailInput.value.trim(), passwordInput.value);
      toast({ type: 'success', title: `Bienvenue, ${user.name}` });
      navigate(HOME_BY_ROLE[user.role] || '/login');
    } catch (err) {
      errorBox.querySelector('span').textContent = err.message;
      errorBox.classList.remove('hidden');
    } finally { submit.disabled=false; }
  });
}
