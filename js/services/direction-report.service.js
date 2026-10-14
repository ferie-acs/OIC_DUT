// Lot d5 : rapport périodique de suivi des antennes au format PDF (jsPDF déjà embarqué pour le DUT).
// Mêmes teintes et même typographie que le PDF officiel du DUT (dut-pdf-layout.js).
const N = [12, 45, 74], G = [90, 99, 115], BORDER = [191, 202, 214], LIGHT = [241, 245, 249];
const text = (v) => String(v ?? '').replace(/[  ]/g, ' ').replace(/[–—]/g, '-').replace(/[’]/g, "'").replace(/→/g, '>');
const number = (v, d = 0) => (v == null || v === '' ? '-' : text(new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(Number(v) || 0)));
const date = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '-');

/** Construit le PDF du rapport (objet `periodicReport`). Renvoie le document jsPDF. */
export function buildReportPdf(jsPDF, report) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });
  const W = 297;
  const put = (value, x, y, size = 9, bold = false, color = N, opts = {}) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color); doc.text(Array.isArray(value) ? value.map(text) : text(value), x, y, opts); };
  const header = () => {
    doc.setFillColor(...N); doc.rect(0, 0, W, 20, 'F');
    put('Office Ivoirien des Chargeurs', 12, 9, 11, true, [255, 255, 255]);
    put(report.title, 12, 15, 9, false, [255, 255, 255]);
    put(`Période : ${report.label} (${date(report.period.from)} - ${date(report.period.to)})`, W - 12, 9, 8, true, [255, 255, 255], { align: 'right' });
    put(`Édité le ${date(report.generatedAt)} par ${report.generatedBy}`, W - 12, 15, 7, false, [255, 255, 255], { align: 'right' });
  };
  header();
  let y = 30;
  put('Indicateurs nationaux', 12, y, 10, true);
  y += 4;
  const cols = report.indicators.length;
  const cw = (W - 24) / cols;
  report.indicators.forEach((ind, i) => {
    const x = 12 + i * cw;
    doc.setFillColor(...LIGHT); doc.setDrawColor(...BORDER); doc.rect(x, y, cw - 2, 16, 'FD');
    put(ind.label.toUpperCase(), x + 2, y + 5, 5.8, true, G, { maxWidth: cw - 6 });
    put(`${number(report.national[ind.key], 1)}${ind.unit ? ` ${ind.unit}` : ''}`, x + 2, y + 13, 11, true);
  });
  y += 24;
  put(`Classement des antennes (${report.actives} active(s) sur ${report.rows.length})`, 12, y, 10, true);
  y += 3;
  const att = new Map(report.objectifs.map((o) => [o.antennaId, o]));
  const head = ['Rang', 'Antenne', ...report.indicators.map((i) => `${i.label}${i.unit ? ` (${i.unit})` : ''}`), 'Évol. validés', 'Objectifs'];
  const widths = [12, 44, ...report.indicators.map(() => (W - 24 - 12 - 44 - 22 - 20) / report.indicators.length), 22, 20];
  const row = (cells, yy, bold = false, fill = null) => {
    let x = 12;
    if (fill) { doc.setFillColor(...fill); doc.rect(12, yy - 4, W - 24, 6.5, 'F'); }
    cells.forEach((c, i) => { put(doc.splitTextToSize(text(c), widths[i] - 2).slice(0, bold ? 2 : 1), i > 1 ? x + widths[i] - 2 : x + 1, yy, bold ? 6.2 : 7.5, bold, bold ? G : N, i > 1 ? { align: 'right' } : {}); x += widths[i]; });
  };
  y += 5; row(head, y, true, LIGHT); y += 7;
  const shown = report.rows.filter((r) => r.actif);
  const inactive = report.rows.length - shown.length;
  shown.forEach((r) => {
    if (y > 190) { doc.addPage(); header(); y = 30; row(head, y, true, LIGHT); y += 7; }
    const ev = r.evolution.dutValides;
    row([r.rang, r.name, ...report.indicators.map((i) => number(r.values[i.key], 1)), `${ev > 0 ? '+' : ''}${number(ev, 1)}`, att.get(r.id)?.taux != null ? `${number(att.get(r.id).taux, 1)} %` : '-'], y);
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.1); doc.line(12, y + 2.2, W - 12, y + 2.2);
    y += 6.5;
  });
  if (inactive) { put(`${inactive} antenne(s) sans DUT sur la période ne sont pas détaillées (voir l’export CSV).`, 12, y + 2, 7.5, false, G); y += 8; }
  y += 4;
  if (y > 175) { doc.addPage(); header(); y = 30; }
  put('Points d’attention', 12, y, 10, true); y += 6;
  const p = report.pointsAttention;
  [[`Contrats d’objectifs à valider : ${p.contratsAValider}`, `Actions correctives en retard : ${p.actionsEnRetard}`, `Documents à valider : ${p.documentsAValider}`],
    [`Décisions de réunion en retard : ${p.decisionsEnRetard}`, `Contrats échus ou à échéance sous 60 jours : ${p.contratsEcheance}`, `Contrats en circuit de validation : ${p.contratsEnCircuit}`]]
    .forEach((line) => { line.forEach((t, i) => put(t, 12 + i * 92, y, 8)); y += 5; });
  if (report.actionsEnRetard.length) {
    y += 3; put('Actions correctives en retard', 12, y, 9, true); y += 5;
    report.actionsEnRetard.slice(0, 8).forEach((a) => { put(`${date(a.dueDate)} · ${a.title} · ${a.responsible}${a.line ? ` · ${a.line.assignee}` : ''}`, 14, y, 7.5); y += 4.5; });
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) { doc.setPage(i); put(`Document de pilotage interne - POC local - page ${i} / ${pages}`, W / 2, 204, 6.5, false, G, { align: 'center' }); }
  return doc;
}
