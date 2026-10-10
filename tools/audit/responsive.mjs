// Audit responsive : parcourt toutes les routes à plusieurs largeurs, relève les débordements
// horizontaux et les cibles tactiles trop petites, et capture les écrans mobiles.
// Usage : node tools/audit/responsive.mjs [--base http://localhost:8080] [--shots dir]
import { chromium } from '../video-export/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:8080'), SHOTS = arg('--shots', ''); if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const WIDTHS = [[390, 844, true], [768, 1024, true], [1366, 800, false]];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/?r=audit#/login`, { waitUntil: 'networkidle' });
const data = await page.evaluate(() => {
  const users = JSON.parse(localStorage.getItem('dut_users') || '[]'); const duts = JSON.parse(localStorage.getItem('dut_list') || '[]');
  const email = (role) => users.find((u) => u.role === role)?.email;
  const partner = users.find((u) => u.role === 'PARTNER_ADMIN');
  const valide = duts.find((d) => d.status === 'VALIDE' && !d.canary && d.partnerId === partner?.partnerId)?.id, termine = duts.find((d) => d.status === 'TERMINE')?.id;
  return { oic: email('OIC_ADMIN'), partner: email('PARTNER_ADMIN'), ctrl: email('CONTROLLER'), antenna: email('ANTENNA_AGENT'), transp: email('TRANSPORTEUR'), valide, termine };
});
const ROUTES = [
  [data.oic, ['/oic/dashboard', '/oic/operations', '/oic/antennas', '/planning', '/actions', '/admin/users', '/admin/roles', '/admin/settings', '/admin/audit', '/decouvrir']],
  [data.partner, ['/partner/dashboard', '/partner/dut', '/partner/operations', '/partner/referentials', '/partner/antennas', `/dut/${data.valide}`, `/dut/${data.valide}/transport`, `/dut/${data.valide}/documents`]],
  [data.ctrl, ['/control']],
  [data.antenna, ['/antenna/dashboard', `/antenna/dut/${data.termine}`]],
  [data.transp, ['/transporteur/dashboard']],
];
const findings = [];
for (const [w, h, mobile] of WIDTHS) {
  await page.setViewportSize({ width: w, height: h });
  for (const [email, routes] of ROUTES) {
    await page.evaluate(async (e) => { const a = await import('/js/core/auth.js'); a.logout?.(); a.login(e, 'demo123'); }, email);
    for (const r of routes) {
      await page.evaluate((hash) => { location.hash = hash; }, '#' + r);
      await page.waitForTimeout(650);
      const res = await page.evaluate((W) => {
        window.scrollTo(0, 0);
        const sel = (el) => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; else if (typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.'); return s; };
        const out = [], small = []; const skip = '.leaflet-container,.modal-overlay,.table-wrap,.plan-scroll,.stepper-h,.plan-seg,.plan-map-list,.tabs-underline,.tabs,.ac-category-tabs';
        document.querySelectorAll('.main-content *, .control-body *, .auth-blue *').forEach((el) => {
          if (!(el instanceof HTMLElement) || el.closest(skip)) return;
          const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') return;
          const b = el.getBoundingClientRect(); if (b.width === 0 && b.height === 0) return;
          if (b.right > W + 2 && out.length < 4) out.push(`${sel(el)} +${Math.round(b.right - W)}`);
          if (el.matches('button,a.btn,[role=button]') && b.height > 0 && b.height < 36 && small.length < 4) small.push(`${sel(el)} ${Math.round(b.height)}px`);
        });
        return { docOverflow: document.documentElement.scrollWidth - W, out, small, h: document.documentElement.scrollHeight, menuVisible: !!document.querySelector('#btn-menu') && getComputedStyle(document.querySelector('#btn-menu')).display !== 'none' };
      }, w);
      const key = r.replace(/[0-9a-f-]{36}/, 'ID');
      if (res.docOverflow > 2 || res.out.length || (w === 390 && res.small.length)) findings.push(`${w}px ${key} | doc+${res.docOverflow} | ${res.out.join(' ; ')}${res.small.length ? ' | petits: ' + res.small.join(', ') : ''}`);
      if (SHOTS && w === 390) await page.screenshot({ path: `${SHOTS}/${w}-${key.replace(/[\/]/g, '_')}.png`, fullPage: false });
    }
  }
}
await browser.close();
console.log(findings.length ? findings.join('\n') : 'Aucun débordement ni cible trop petite.');
