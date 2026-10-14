import { escapeHtml } from './utils.js';

// Horizontal cubic handles keep every segment inside the two data values.
export function curveGeometry(values, width = 360, height = 90, inset = 8) {
  const clean = values.map(value => Math.max(0, Number(value) || 0));
  const max = Math.max(1, ...clean);
  const points = clean.map((value,index) => ({x: clean.length > 1 ? index * width / (clean.length - 1) : width / 2, y: height - inset - value / max * (height - inset * 2), value}));
  let line = points.length ? `M ${points[0].x} ${points[0].y}` : '';
  points.slice(1).forEach((point,index) => { const prev=points[index]; const middle=(prev.x+point.x)/2; line += ` C ${middle} ${prev.y}, ${middle} ${point.y}, ${point.x} ${point.y}`; });
  return { points, line, area: points.length ? `${line} L ${points.at(-1).x} ${height} L ${points[0].x} ${height} Z` : '' };
}

export function lineChartSvg(series, { compact = false, label = 'Évolution des DUT', format = (v) => v } = {}) {
  const width = compact ? 360 : 640, height = compact ? 75 : 200;
  const g = curveGeometry(series.map(p=>p.count),width,height,compact?12:22);
  const description = `${label} : ${series.map(p=>`${p.label} ${format(p.count)}`).join(', ')}`;
  return `<svg class="${compact?'sparkline':'trend-chart'}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(description)}">
    ${compact?'': [0,1,2,3].map(i=>`<line class="chart-gridline" x1="0" x2="${width}" y1="${22+i*52}" y2="${22+i*52}"/>`).join('')}
    <path class="chart-area" d="${g.area}"/><path class="chart-stroke" pathLength="1" d="${g.line}"/>
    ${compact?'':g.points.map((p,i)=>`<circle class="chart-point" cx="${p.x}" cy="${p.y}" r="4"><title>${escapeHtml(series[i].label)} : ${p.value} DUT</title></circle><text class="chart-value" x="${p.x}" y="${p.y-10}" text-anchor="${i===0?'start':i===g.points.length-1?'end':'middle'}">${p.value}</text>`).join('')}
  </svg>`;
}
