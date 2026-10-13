import { settings } from '../services/settings.service.js';
import { getAllDuts } from '../repositories/dut.repository.js';
import { DUT_STATUS } from '../core/constants.js';

// The same role perimeter is used for search, priorities and analytics.
export function visibleDuts(user) {
  if (!user) return [];
  return getAllDuts().filter(d => {
    if (['PARTNER_ADMIN', 'PARTNER_EDITOR'].includes(user.role)) return d.partnerId === user.partnerId;
    if (user.role === 'ANTENNA_AGENT') return d.antennaId === user.antennaId;
    // Lot d3 : un transporteur remplacé lors d'un transbordement garde la trace du DUT.
    if (user.role === 'TRANSPORTEUR') return d.general?.transporterId === user.transporterId || (d.transbordements || []).some((t) => t.avant?.transporterId === user.transporterId);
    return user.role === 'OIC_ADMIN';
  });
}

export function documentUrl(user, dut) {
  return user.role === 'ANTENNA_AGENT' ? `#/antenna/dut/${encodeURIComponent(dut.id)}` : `#/dut/${encodeURIComponent(dut.id)}`;
}

export function computeInsights(duts, days = 90, now = new Date()) {
  const end = now.getTime();
  const start = days ? end - days * 86400000 : -Infinity;
  const selected = duts.filter(d => { const t = Date.parse(d.createdAt); return t >= start && t <= end; });
  const validated = selected.filter(d => d.status === DUT_STATUS.VALIDE);
  const weight = d => (d.marchandises || []).reduce((sum, m) => sum + (Number(m.poidsTonnes) || 0), 0);
  const corridors = new Map();
  validated.forEach(d => {
    const name = `${d.trajet?.chargement?.ville || 'Non renseigné'} → ${d.trajet?.dechargement?.ville || 'Non renseigné'}`;
    const row = corridors.get(name) || { name, count: 0, tonnes: 0 };
    row.count++; row.tonnes += weight(d); corridors.set(name, row);
  });
  const months = Array.from({ length: 6 }, (_, i) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + i, 1));
    const key = date.toISOString().slice(0, 7);
    return { key, label: date.toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' }), count: selected.filter(d => (d.createdAt || '').startsWith(key)).length };
  });
  const pending = duts.filter(d => d.status === DUT_STATUS.TERMINE);
  const elapsed = d => Math.max(0, Math.floor((end - (Date.parse(d.submittedAt || d.createdAt) || end)) / 86400000));
  const priority = duts.filter(d => [DUT_STATUS.REJETE, DUT_STATUS.SUSPENDU, DUT_STATUS.TERMINE, DUT_STATUS.EN_EDITION].includes(d.status))
    .sort((a,b) => {
      const rank = { REJETE: 0, SUSPENDU: 1, TERMINE: 2, EN_EDITION: 3 };
      return rank[a.status] - rank[b.status] || Date.parse(a.submittedAt || a.createdAt) - Date.parse(b.submittedAt || b.createdAt);
    }).map(d => ({ ...d, waitingDays: elapsed(d) }));
  const delays = validated.filter(d => d.submittedAt && d.validatedAt && Date.parse(d.validatedAt) >= Date.parse(d.submittedAt))
    .map(d => (Date.parse(d.validatedAt) - Date.parse(d.submittedAt)) / 3600000);
  return { selected, validated: validated.length, total: selected.length, tonnes: validated.reduce((sum,d)=>sum+weight(d),0),
    pending: selected.filter(d=>d.status===DUT_STATUS.TERMINE).length,
    blocked: selected.filter(d=>[DUT_STATUS.REJETE,DUT_STATUS.SUSPENDU,DUT_STATUS.RETIRE].includes(d.status)).length,
    drafts: selected.filter(d=>d.status===DUT_STATUS.EN_EDITION).length,
    months, corridors: [...corridors.values()].sort((a,b)=>b.tonnes-a.tonnes), priority,
    overdue: pending.filter(d=>elapsed(d)>=settings().overdueDays).length,
    delayHours: delays.length ? delays.reduce((a,b)=>a+b,0)/delays.length : null,
    validationRate: selected.length ? Math.round(validated.length/selected.length*100) : 0,
  };
}

export function searchDocuments(user, query) {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const q = normalize(query).trim();
  if (!q) return [];
  return visibleDuts(user).filter(d => [d.dutNumber,d.general?.immatriculation,d.general?.transporterName,d.partnerName,d.trajet?.chargement?.ville,d.trajet?.dechargement?.ville]
    .some(value=>normalize(value).includes(q))).slice(0,8);
}


export function insightsCsv(s, days) {
  const rows = [['Indicateur','Valeur'],['Période',days ? `${days} derniers jours` : 'Tout l’historique'],['Dossiers',s.total],['DUT validés',s.validated],['Tonnage DUT validés',s.tonnes],['Taux de validation (%)',s.validationRate],['Délai moyen de validation (h)',s.delayHours ?? ''],[`Attente >= ${settings().overdueDays} jours (tous dossiers)`,s.overdue],[],['Corridor','Tonnage','Nombre de DUT'],...s.corridors.map(c=>[c.name,c.tonnes,c.count])];
  const safe = value => '"' + String(value).replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
  return '\uFEFF' + rows.map(row=>row.map(safe).join(';')).join('\r\n');
}
