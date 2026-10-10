/** Calque HTML : étiquette DUT qui suit son objet, sous-titres, journal d'audit. Texte via textContent. */
import * as THREE from 'three';
import { DUT_STATUS_STYLE } from '../palette.js';
import { AUDIT } from '../scenario.js';
import { ndcToPixels } from './project.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LABEL_HEIGHT = { truck: 5.0, document: 3.2 };

/** Pictogramme QR statique (motif fixe, purement décoratif). */
function qrIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 7 7');
  svg.setAttribute('class', 'd3-label__qr');
  svg.setAttribute('aria-hidden', 'true');
  const cells = ['0,0,3', '4,0,3', '0,4,3', '4,4,1', '6,6,1', '5,5,1', '4,6,1', '6,4,1'];
  for (const c of cells) {
    const [x, y, s] = c.split(',').map(Number);
    const r = document.createElementNS(SVG_NS, 'rect');
    for (const [k, v] of [['x', x], ['y', y], ['width', s], ['height', s], ['fill', '#FFFFFF']]) r.setAttribute(k, String(v));
    svg.append(r);
  }
  return svg;
}

function createLabel(container) {
  const el = document.createElement('div');
  el.className = 'd3-label';
  const id = document.createElement('span');
  id.className = 'd3-label__id';
  const num = document.createElement('span');
  num.className = 'd3-label__num';
  const qr = qrIcon();
  el.append(id, num, qr);
  container.append(el);
  return { el, id, num, qr };
}

export function createOverlay(stageEl) {
  const subtitle = stageEl.querySelector('#d3-subtitle');
  const auditEl = stageEl.querySelector('#d3-audit');
  const list = auditEl.querySelector('ol');
  const label = createLabel(stageEl.querySelector('#d3-labels'));
  const rows = AUDIT.map((row) => {
    const li = document.createElement('li');
    const time = document.createElement('time');
    time.textContent = row.time;
    const text = document.createElement('span');
    text.textContent = row.text;
    li.append(time, text);
    list.append(li);
    return li;
  });
  const v = new THREE.Vector3();

  return {
    update(s, world, stage) {
      if (subtitle.textContent !== s.subtitle.text) subtitle.textContent = s.subtitle.text;
      subtitle.style.opacity = String(s.subtitle.opacity);

      const style = DUT_STATUS_STYLE[s.dut.status];
      label.el.hidden = !style;
      if (style) {
        const idText = `DUT · ${style.label}`;
        if (label.id.textContent !== idText) label.id.textContent = idText;
        const numText = s.dut.number ?? '';
        if (label.num.textContent !== numText) label.num.textContent = numText;
        label.num.hidden = !s.dut.number;
        label.qr.style.display = s.dut.qr ? 'block' : 'none';
        label.el.style.setProperty('--tone', style.color);
        const anchor = s.dut.anchor === 'document' ? s.doc : s.truck;
        v.set(anchor.x, LABEL_HEIGHT[s.dut.anchor], anchor.z).project(stage.camera);
        const canvas = stage.renderer.domElement;
        const { left, top } = ndcToPixels(v.x, v.y, canvas.clientWidth, canvas.clientHeight);
        label.el.style.transform = `translate(${left}px, ${top}px) translate(-50%, -100%)`;
      }

      auditEl.hidden = !s.audit.visible;
      rows.forEach((li, i) => li.classList.toggle('is-lit', i < s.audit.lit));
    },
  };
}
