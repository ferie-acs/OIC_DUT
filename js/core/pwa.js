// Installation et mise à jour de l'application (PWA). Aucun effet sans contexte sécurisé.
import { toast } from './ui.js';
import { icon } from './icons.js';

let deferredPrompt = null;

/** Enregistre le service worker et signale une nouvelle version. */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    // Quand un nouveau service worker prend la main, on recharge une fois : plus de mélange de versions.
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded) return; reloaded = true; if (navigator.serviceWorker.controller) window.location.reload(); });
    const reg = await navigator.serviceWorker.register('sw.js');
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          toast({ type: 'info', title: 'Nouvelle version disponible', desc: 'Rechargez la page pour l’appliquer.' });
        }
      });
    });
    return reg;
  } catch (err) {
    console.warn('Service worker non enregistré :', err);
    return null;
  }
}

/** Bouton « Installer l’application » dans la barre latérale, quand le navigateur le propose. */
export function mountInstallButton() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    renderInstallButton();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    document.querySelector('#btn-install-app')?.remove();
    toast({ type: 'success', title: 'Application installée' });
  });
  // La barre latérale est reconstruite à chaque navigation : on réinsère le bouton si besoin.
  window.addEventListener('hashchange', () => setTimeout(renderInstallButton, 0));
}

function renderInstallButton() {
  if (!deferredPrompt) return;
  const footer = document.querySelector('.sidebar-footer');
  if (!footer || footer.querySelector('#btn-install-app')) return;
  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'btn-install-app'; btn.className = 'btn btn-navy btn-block btn-sm';
  btn.innerHTML = `${icon('download', { size: 14 })} Installer l’application`;
  btn.addEventListener('click', async () => {
    const p = deferredPrompt; if (!p) return;
    deferredPrompt = null;
    p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome !== 'accepted') { deferredPrompt = p; } else btn.remove();
  });
  footer.prepend(btn);
}
