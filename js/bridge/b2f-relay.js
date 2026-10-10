// Relais de la passerelle B2F → DUT : tourne dans une iframe invisible ouverte par la Bourse de fret.
// N'écoute que les origines autorisées, ne répond qu'à l'origine exacte de l'émetteur, jamais à « * ».
import { B2F_ORIGINS, receive } from '../services/b2f-link.service.js';

window.addEventListener('message', (event) => {
  if (!B2F_ORIGINS.includes(event.origin) || event.source !== window.parent) return;
  let result;
  try { result = receive(event.origin, event.data); }
  catch (err) { result = { statut: 'refusé', raison: 'enregistrement impossible' }; console.warn('[passerelle B2F]', err); }
  event.source.postMessage({ v: 1, type: 'dut.ack', id: event.data?.id || event.data?.appariementId || null, ...result }, event.origin);
});

// Signale à la Bourse de fret que le relais est prêt (origines autorisées uniquement).
if (window.parent !== window) for (const origin of B2F_ORIGINS) window.parent.postMessage({ v: 1, type: 'dut.ready' }, origin);
