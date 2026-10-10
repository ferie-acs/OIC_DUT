import { getCurrentUser } from '../core/auth.js';
import { planningRows, overlaps, savePlanningSchedule, demoRows, addPlanningExamples } from '../services/planning.service.js';
import { STAGES } from '../services/workspace.service.js';
import { escapeHtml as esc } from '../core/utils.js';
import { openModal, toast } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { mountTripMap } from './planning-map.view.js?v=3';
import { normalizeCity } from '../data/cities.js';
const DAY = 86400000;
const localDay = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const dateText = s => new Date(s).toLocaleString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
/** « 2 j 9 h », « 9 h 30 » : durée lisible entre deux horodatages. */
export function durationText(start, end) {
  const ms = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const h = Math.round(ms / 36e5), d = Math.floor(h / 24), rest = h % 24;
  if (d === 0) { const m = Math.round((ms % 36e5) / 6e4); return m && h < 6 ? `${Math.floor(ms / 36e5)} h ${String(m).padStart(2, '0')}` : `${h} h`; }
  return rest ? `${d} j ${rest} h` : `${d} j`;
}
const STATUS_FILTERS = [['ALL','Tous'],['blue','Prévu'],['green','En route / arrivé'],['gray','Livré'],['orange','Suspendu / retiré']];
export function colorOf(r) { return ['SUSPENDU','RETIRE','REJETE'].includes(r.dut.status)?'orange':r.record.stage==='DELIVERED'?'gray':['DEPARTED','ARRIVED'].includes(r.record.stage)?'green':'blue'; }
/** Filtre multicritère : texte libre + statut + départ + arrivée + transporteur. */
export function matchesFilters(r, f) {
  const text = [r.dut.dutNumber, r.dut.general?.immatriculation, r.dut.general?.transporterName, r.dut.trajet?.chargement?.ville, r.dut.trajet?.dechargement?.ville].join(' ');
  if (f.query && !normalizeCity(text).includes(normalizeCity(f.query))) return false;
  if (f.status && f.status !== 'ALL' && colorOf(r) !== f.status) return false;
  if (f.from && normalizeCity(r.dut.trajet?.chargement?.ville) !== f.from) return false;
  if (f.to && normalizeCity(r.dut.trajet?.dechargement?.ville) !== f.to) return false;
  if (f.carrier && (r.dut.general?.transporterName || '') !== f.carrier) return false;
  return true;
}
export function render(container) {
  let anchor = localDay(new Date(Date.now()-3*DAY)), days = 14, selectedTrip = null, tripMap = null, debounce = null;
  const filters = { query: '', status: 'ALL', from: '', to: '', carrier: '' };
  function draw(focusSearch = false) {
    tripMap?.destroy();
    const all = [...planningRows(), ...demoRows()];
    const start = new Date(`${anchor}T00:00`).getTime(), end = start + days*DAY;
    const filtered = all.filter(r => matchesFilters(r, filters));
    const rows = filtered.filter(r => r.valid && Date.parse(r.start) < end && Date.parse(r.end) > start).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
    const missing = filtered.filter(r=>!r.valid);
    const now = Date.now(), today = (now-start)/(end-start)*100;
    const conflict = r => all.some(other=>overlaps(r,other));
    const activeFilters = Object.entries(filters).filter(([k,v])=>v && !(k==='status'&&v==='ALL')).length;
    const uniq = (list) => [...new Map(list.filter(Boolean).map(v=>[normalizeCity(v), v])).values()].sort((a,b)=>a.localeCompare(b,'fr'));
    const cities = { from: uniq(all.map(r=>r.dut.trajet?.chargement?.ville)), to: uniq(all.map(r=>r.dut.trajet?.dechargement?.ville)) };
    const carriers = [...new Set(all.map(r=>r.dut.general?.transporterName).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
    const options = (list, current, keyFn) => list.map(v=>`<option value="${esc(keyFn(v))}" ${keyFn(v)===current?'selected':''}>${esc(v)}</option>`).join('');
    const canDemo = ['OIC_ADMIN','PARTNER_ADMIN'].includes(getCurrentUser()?.role);
    container.innerHTML = `<div class="planning-page">
    <header class="plan-header"><div><span class="overline">Pilotage des transports</span><h1>Planning des trajets</h1><p>Les voyages attendus, camion par camion : où ils vont, quand ils partent, combien de temps ils roulent.</p></div><div class="plan-header-actions"><span class="badge badge-accent">Enregistrement local actif</span>${canDemo?'<button class="btn btn-secondary btn-sm" id="plan-demo">Ajouter les voyages de démo</button>':''}</div></header>
    <p class="plan-demo-line">${icon('info', { size: 14 })} Les voyages marqués <strong>DÉMO</strong> sont fictifs et distincts des DUT ; aucun numéro officiel n’est consommé.</p>
    <div class="plan-summary"><div><strong>${rows.length}</strong><span>trajets sur la période</span></div><div><strong>${rows.filter(r=>r.record.stage==='DEPARTED').length}</strong><span>en route déclarés</span></div><div><strong>${rows.filter(conflict).length}</strong><span>trajets en chevauchement</span></div><div><strong>${missing.length}</strong><span>à planifier</span></div></div>

    <section class="card plan-card plan-map-card">
      <div class="plan-toolbar"><div><h2>Carte des trajets</h2><p>Cherchez un camion, un transporteur ou une ville : la carte, la chronologie et l’annuaire se filtrent ensemble.</p></div><span class="plan-map-hint">Tracé indicatif à vol d’oiseau</span></div>
      <div class="plan-finder" role="search" aria-label="Rechercher un trajet">
        <div class="plan-finder-row">
          <label class="plan-finder-search">${icon('search', { size: 17 })}<input type="search" id="pf-q" placeholder="Rechercher une plaque, un n° DUT, un transporteur, une ville…" value="${esc(filters.query)}" autocomplete="off"></label>
          <label class="plan-pill ${filters.from?'is-set':''}"><span>${icon('pin', { size: 14 })} Départ</span><select class="plan-pill-select" id="pf-from"><option value="">Toutes</option>${options(cities.from, filters.from, normalizeCity)}</select></label>
          <label class="plan-pill ${filters.to?'is-set':''}"><span>${icon('map', { size: 14 })} Arrivée</span><select class="plan-pill-select" id="pf-to"><option value="">Toutes</option>${options(cities.to, filters.to, normalizeCity)}</select></label>
          <label class="plan-pill ${filters.carrier?'is-set':''}"><span>${icon('truck', { size: 14 })} Transporteur</span><select class="plan-pill-select" id="pf-carrier"><option value="">Tous</option>${options(carriers, filters.carrier, v=>v)}</select></label>
        </div>
        <div class="plan-finder-row plan-finder-row-2">
          <div class="plan-seg" role="group" aria-label="Statut">${STATUS_FILTERS.map(([v,l])=>`<button type="button" class="plan-seg-btn" data-status="${v}" aria-pressed="${filters.status===v}">${v!=='ALL'?`<i class="plan-dot ${v==='blue'?'':v}"></i>`:''}${l}</button>`).join('')}</div>
          <span class="plan-finder-count"><strong>${rows.length}</strong> trajet${rows.length>1?'s':''} sur la période${activeFilters?` · <em>${activeFilters} filtre${activeFilters>1?'s':''} actif${activeFilters>1?'s':''}</em>`:''}${activeFilters?`<button type="button" class="plan-finder-reset" id="pf-reset">${icon('x', { size: 12 })} Effacer</button>`:''}</span>
        </div>
      </div>
      <div class="plan-map-layout"><div id="plan-map" class="plan-map" role="region" aria-label="Carte de la Côte d'Ivoire avec les trajets"></div><div class="plan-map-list" id="plan-map-list"></div></div>
    </section>

    <section class="card plan-card"><div class="plan-toolbar plan-toolbar-chrono"><div><h2>Chronologie des transports</h2><p>Horaires locaux · barres = prévisions · statuts = déclarations</p><span class="plan-legend"><i class="plan-dot"></i> Prévu <i class="plan-dot green"></i> En route / arrivé <i class="plan-dot gray"></i> Livré <i class="plan-dot orange"></i> Suspendu / retiré</span></div>
    <div class="plan-controls"><div class="plan-nav" role="group" aria-label="Période"><button class="plan-nav-btn" id="plan-prev" aria-label="Période précédente" title="Période précédente">${icon('chevronLeft', { size: 16 })}</button><button class="plan-nav-btn" id="plan-today">Aujourd’hui</button><button class="plan-nav-btn" id="plan-existing">Derniers trajets</button><button class="plan-nav-btn" id="plan-next" aria-label="Période suivante" title="Période suivante">${icon('chevronRight', { size: 16 })}</button></div><label class="plan-pill"><span>${icon('calendar', { size: 14 })} Début</span><input class="plan-pill-select" type="date" id="plan-date" value="${anchor}" required></label><label class="plan-pill"><span>${icon('clock', { size: 14 })} Période</span><select class="plan-pill-select" id="plan-days">${[7,14,30].map(n=>`<option value="${n}" ${days===n?'selected':''}>${n} jours</option>`).join('')}</select></label></div></div>
    <div class="plan-scroll"><div class="plan-grid" style="--days:${days}"><div class="plan-grid-head"><strong>Camion · trajet · dates</strong><div class="plan-scale">${Array.from({length:days},(_,i)=>`<span>${new Date(start+i*DAY).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})}</span>`).join('')}</div></div>
    <div class="plan-body">${today>=0&&today<=100?`<div class="plan-today-track"><div class="plan-today" style="left:${today}%"><span>Aujourd’hui</span></div></div>`:''}
    ${rows.map(r=>{
      const left=Math.max(0,(Date.parse(r.start)-start)/(end-start)*100), right=Math.min(100,(Date.parse(r.end)-start)/(end-start)*100);
      const blocked=['SUSPENDU','RETIRE','REJETE'].includes(r.dut.status);
      const color=colorOf(r);
      return `<div class="plan-row ${selectedTrip===r.dut.id?'is-selected':''}"><div class="plan-label" data-trip="${esc(r.dut.id)}" role="button" tabindex="0" title="Voir le trajet sur la carte"><strong>${esc(r.dut.general?.immatriculation || 'Camion à préciser')}</strong><span>${esc(r.dut.trajet?.chargement?.ville || 'Départ')} → ${esc(r.dut.trajet?.dechargement?.ville || 'Arrivée')}</span><span class="plan-when">${esc(dateText(r.start))} → ${esc(dateText(r.end))} · <b>${esc(durationText(r.start, r.end))}</b></span><small>${esc(r.dut.dutNumber || 'Brouillon')} · ${esc(blocked?r.dut.status:STAGES[r.record.stage])}</small>${conflict(r)?'<small class="plan-warning">⚠ Affectations qui se chevauchent</small>':''}</div><div class="plan-track"><button class="plan-bar ${color}" data-plan="${esc(r.dut.id)}" style="left:${left}%;width:${Math.max(right-left,.45)}%" aria-label="Planifier ${esc(r.dut.general?.immatriculation || 'ce trajet')} : ${esc(dateText(r.start))} à ${esc(dateText(r.end))}" title="${esc(dateText(r.start))} → ${esc(dateText(r.end))} · ${esc(durationText(r.start, r.end))}"><span>${esc(r.dut.general?.transporterName || 'Transport')} · ${esc(durationText(r.start, r.end))}</span></button></div></div>`;
    }).join('') || `<div class="plan-empty">Aucun trajet sur cette période${activeFilters?' avec ces filtres':''}. Changez les dates${activeFilters?', effacez les filtres':''} ou planifiez un dossier ci-dessous.</div>`}</div></div></div>
    <p class="plan-foot">Cliquez sur une barre pour consulter ou ajuster le planning, sur la colonne de gauche pour voir le trajet sur la carte. Les barres ne représentent pas une position GPS.</p></section>
    <section class="card plan-card"><h2>Dossiers à planifier ou à retrouver</h2><p>Les dates du DUT servent de prévision initiale. Une modification ici ajuste le planning opérationnel, sans modifier le document émis.</p><div class="plan-directory">${filtered.map(r=>`<button class="plan-directory-item" data-plan="${esc(r.dut.id)}"><strong>${esc(r.dut.general?.immatriculation || 'Camion à préciser')}</strong><span>${esc(r.dut.dutNumber || 'Brouillon')} · ${esc(r.dut.trajet?.chargement?.ville || 'Départ')} → ${esc(r.dut.trajet?.dechargement?.ville || 'Arrivée')}</span><small>${r.valid?`${esc(dateText(r.start))} · ${esc(durationText(r.start, r.end))}`:'Dates à renseigner'} →</small></button>`).join('') || '<p>Aucun dossier correspondant.</p>'}</div></section></div>`;
    container.querySelector('#plan-demo')?.addEventListener('click',()=>{try{const count=addPlanningExamples();draw();toast({type:'success',title:count?`${count} voyages fictifs ajoutés`:'Les voyages de démo sont déjà présents'});}catch(e){toast({type:'error',title:e.message});}});
    container.querySelector('#plan-prev').onclick=()=>{anchor=localDay(new Date(start-days*DAY));draw();};
    container.querySelector('#plan-next').onclick=()=>{anchor=localDay(new Date(end));draw();};
    container.querySelector('#plan-existing').onclick=()=>{const latest=all.filter(r=>r.valid).sort((a,b)=>Date.parse(b.start)-Date.parse(a.start))[0];if(latest){anchor=localDay(new Date(Date.parse(latest.start)-6*DAY));draw();}};
    container.querySelector('#plan-today').onclick=()=>{anchor=localDay(new Date(Date.now()-3*DAY));draw();};
    container.querySelector('#plan-date').onchange=e=>{if(e.target.value){anchor=e.target.value;draw();}};
    container.querySelector('#plan-days').onchange=e=>{days=Number(e.target.value);draw();};
    // Module de recherche : texte libre en direct (anti-rebond), chips de statut, listes déroulantes.
    const q=container.querySelector('#pf-q');
    q.oninput=e=>{clearTimeout(debounce);debounce=setTimeout(()=>{filters.query=e.target.value.trim();draw(true);},220);};
    container.querySelectorAll('.plan-seg-btn').forEach(b=>b.onclick=()=>{filters.status=b.dataset.status;draw();});
    container.querySelector('#pf-from').onchange=e=>{filters.from=e.target.value;draw();};
    container.querySelector('#pf-to').onchange=e=>{filters.to=e.target.value;draw();};
    container.querySelector('#pf-carrier').onchange=e=>{filters.carrier=e.target.value;draw();};
    container.querySelector('#pf-reset')?.addEventListener('click',()=>{Object.assign(filters,{query:'',status:'ALL',from:'',to:'',carrier:''});draw();});
    if(focusSearch){q.focus();q.setSelectionRange(q.value.length,q.value.length);}
    container.querySelectorAll('[data-plan]').forEach(b=>b.onclick=()=>edit(all.find(r=>r.dut.id===b.dataset.plan)));
    tripMap=mountTripMap(container,rows,{colorOf,selectedId:selectedTrip,onSelect:id=>{selectedTrip=id;container.querySelectorAll('.plan-row').forEach(row=>row.classList.toggle('is-selected',row.querySelector('.plan-label')?.dataset.trip===id));}});
    const pick=el=>{const id=el.dataset.trip;tripMap.select(id);container.querySelector('.plan-map-card')?.scrollIntoView({behavior:'smooth',block:'nearest'});};
    container.querySelectorAll('.plan-label[data-trip]').forEach(el=>{el.onclick=()=>pick(el);el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick(el);}};});
  }
  function edit(r) {
    openModal({title:'Prévoir le trajet',text:`${r.dut.general?.immatriculation || 'Camion à préciser'} · ${r.dut.dutNumber || 'Brouillon'}`,confirmLabel:'Enregistrer le planning',bodyHtml:`<form id="schedule-form" class="workspace-form"><label class="field">Départ prévu<input class="input" type="datetime-local" name="start" required value="${esc(r.start)}"></label><label class="field">Arrivée prévue<input class="input" type="datetime-local" name="end" required value="${esc(r.end)}"></label><p role="alert" id="schedule-error"></p>${r.dut.planningDemo?'<p class="text-muted">Voyage fictif de présentation : aucun DUT émis associé.</p>':`<a href="#/dut/${encodeURIComponent(r.dut.id)}/transport" id="plan-open" class="btn btn-secondary">Ouvrir le suivi du dossier</a>`}</form>`,onConfirm:({root,close})=>{const form=root.querySelector('form');if(!form.reportValidity())return;try{savePlanningSchedule(r.dut.id,Object.fromEntries(new FormData(form)));close();draw();toast({type:'success',title:'Planning enregistré localement'});}catch(e){root.querySelector('#schedule-error').textContent=e.message;}}});
    document.querySelector('#plan-open')?.addEventListener('click',()=>document.querySelector('.modal-close').click());
    document.querySelector('#schedule-form').onsubmit=e=>{e.preventDefault();document.querySelector('[data-action="confirm"]').click();};
  }
  draw();
}
