import { getCurrentUser } from '../core/auth.js';
import { planningRows, overlaps, savePlanningSchedule, demoRows, addPlanningExamples } from '../services/planning.service.js';
import { STAGES } from '../services/workspace.service.js';
import { escapeHtml as esc } from '../core/utils.js';
import { openModal, toast } from '../core/ui.js';
import { mountTripMap } from './planning-map.view.js';
const DAY = 86400000;
const localDay = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const dateText = s => new Date(s).toLocaleString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
export function render(container) {
  let anchor = localDay(new Date(Date.now()-3*DAY)), days = 14, query = '', selectedTrip = null, tripMap = null;
  function draw() {
    tripMap?.destroy();
    const all = [...planningRows(), ...demoRows()];
    const start = new Date(`${anchor}T00:00`).getTime(), end = start + days*DAY;
    const filtered = all.filter(r => [r.dut.dutNumber,r.dut.general?.immatriculation,r.dut.general?.transporterName,r.dut.trajet?.chargement?.ville,r.dut.trajet?.dechargement?.ville].join(' ').toLowerCase().includes(query.toLowerCase()));
    const rows = filtered.filter(r => r.valid && Date.parse(r.start) < end && Date.parse(r.end) > start).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
    const missing = filtered.filter(r=>!r.valid);
    const now = Date.now(), today = (now-start)/(end-start)*100;
    const conflict = r => all.some(other=>overlaps(r,other));
    container.innerHTML = `<div class="planning-page"><header class="plan-header"><div><span class="overline">PILOTAGE DES TRANSPORTS</span><h1>Planning des trajets</h1><p>Les voyages attendus, camion par camion. Une vision commune du départ à la livraison.</p></div><span class="badge badge-accent">Enregistrement local actif</span></header>
    <div class="plan-demo-note"><div><strong>Comprendre le planning par l’exemple</strong><p>Les voyages marqués DÉMO sont fictifs et distincts des DUT. Ils illustrent les départs échelonnés, les livraisons et les chevauchements. Aucun numéro officiel n’est consommé.</p></div>${['OIC_ADMIN','PARTNER_ADMIN'].includes(getCurrentUser()?.role)?'<button class="btn btn-secondary" id="plan-demo">Ajouter les voyages de démo</button>':''}</div>
    <div class="plan-summary"><div><strong>${rows.length}</strong><span>trajets sur la période</span></div><div><strong>${rows.filter(r=>r.record.stage==='DEPARTED').length}</strong><span>en route déclarés</span></div><div><strong>${rows.filter(conflict).length}</strong><span>trajets en chevauchement</span></div><div><strong>${missing.length}</strong><span>à planifier</span></div></div>
    <section class="card plan-card plan-map-card"><div class="plan-toolbar"><div><h2>Carte des trajets</h2><p>Cliquez sur un camion, ici ou dans la chronologie : son trajet se dessine.</p></div><span class="plan-map-hint">Tracé indicatif à vol d'oiseau</span></div><div class="plan-map-layout"><div id="plan-map" class="plan-map" role="region" aria-label="Carte de la Côte d'Ivoire avec les trajets"></div><div class="plan-map-list" id="plan-map-list"></div></div></section>
    <section class="card plan-card"><div class="plan-toolbar"><div><h2>Chronologie des transports</h2><p>Horaires locaux · barres = prévisions · statuts = déclarations</p></div><div class="plan-controls"><button class="btn btn-secondary" id="plan-prev" aria-label="Période précédente">←</button><button class="btn btn-secondary" id="plan-today">Aujourd’hui</button><button class="btn btn-secondary" id="plan-existing">Derniers trajets</button><button class="btn btn-secondary" id="plan-next" aria-label="Période suivante">→</button><label>Début<input class="input" type="date" id="plan-date" value="${anchor}" required></label><label>Période<select class="select" id="plan-days">${[7,14,30].map(n=>`<option value="${n}" ${days===n?'selected':''}>${n} jours</option>`).join('')}</select></label></div></div>
    <div class="plan-search"><input class="input" id="plan-query" aria-label="Rechercher un transport" placeholder="Camion, DUT, transporteur ou ville…" value="${esc(query)}"><span><i class="plan-dot"></i> Prévu <i class="plan-dot green"></i> En route / arrivé <i class="plan-dot gray"></i> Livré <i class="plan-dot orange"></i> Suspendu / retiré</span></div>
    <div class="plan-scroll"><div class="plan-grid" style="--days:${days}"><div class="plan-grid-head"><strong>CAMION / TRAJET</strong><div class="plan-scale">${Array.from({length:days},(_,i)=>`<span>${new Date(start+i*DAY).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})}</span>`).join('')}</div></div>
    <div class="plan-body">${today>=0&&today<=100?`<div class="plan-today-track"><div class="plan-today" style="left:${today}%"><span>Aujourd’hui</span></div></div>`:''}
    ${rows.map(r=>{
      const left=Math.max(0,(Date.parse(r.start)-start)/(end-start)*100), right=Math.min(100,(Date.parse(r.end)-start)/(end-start)*100);
      const blocked=['SUSPENDU','RETIRE','REJETE'].includes(r.dut.status);
      const color=blocked?'orange':r.record.stage==='DELIVERED'?'gray':['DEPARTED','ARRIVED'].includes(r.record.stage)?'green':'blue';
      return `<div class="plan-row ${selectedTrip===r.dut.id?'is-selected':''}"><div class="plan-label" data-trip="${esc(r.dut.id)}" role="button" tabindex="0" title="Voir le trajet sur la carte"><strong>${esc(r.dut.general?.immatriculation || 'Camion à préciser')}</strong><span>${esc(r.dut.trajet?.chargement?.ville || 'Départ')} → ${esc(r.dut.trajet?.dechargement?.ville || 'Arrivée')}</span><small>${esc(r.dut.dutNumber || 'Brouillon')} · ${esc(blocked?r.dut.status:STAGES[r.record.stage])}</small>${conflict(r)?'<small class="plan-warning">⚠ Affectations qui se chevauchent</small>':''}</div><div class="plan-track"><button class="plan-bar ${color}" data-plan="${esc(r.dut.id)}" style="left:${left}%;width:${Math.max(right-left,.45)}%" aria-label="Planifier ${esc(r.dut.general?.immatriculation || 'ce trajet')} : ${esc(dateText(r.start))} à ${esc(dateText(r.end))}" title="${esc(dateText(r.start))} → ${esc(dateText(r.end))}"><span>${esc(r.dut.general?.transporterName || 'Transport')}</span></button></div></div>`;
    }).join('') || '<div class="plan-empty">Aucun trajet sur cette période. Changez les dates ou planifiez un dossier ci-dessous.</div>'}</div></div></div>
    <p class="plan-foot">Cliquez sur une barre pour consulter ou ajuster le planning. Les barres ne représentent pas une position GPS ni un trajet effectivement réalisé.</p></section>
    <section class="card plan-card"><h2>Dossiers à planifier ou à retrouver</h2><p>Les dates du DUT servent de prévision initiale. Une modification ici ajuste le planning opérationnel, sans modifier le document émis.</p><div class="plan-directory">${filtered.map(r=>`<button class="plan-directory-item" data-plan="${esc(r.dut.id)}"><strong>${esc(r.dut.general?.immatriculation || 'Camion à préciser')}</strong><span>${esc(r.dut.dutNumber || 'Brouillon')} · ${esc(r.dut.trajet?.chargement?.ville || 'Départ')} → ${esc(r.dut.trajet?.dechargement?.ville || 'Arrivée')}</span><small>${r.valid?esc(dateText(r.start)):'Dates à renseigner'} →</small></button>`).join('') || '<p>Aucun dossier correspondant.</p>'}</div></section></div>`;
    container.querySelector('#plan-demo')?.addEventListener('click',()=>{try{const count=addPlanningExamples();draw();toast({type:'success',title:count?`${count} voyages fictifs ajoutés`:'Les voyages de démo sont déjà présents'});}catch(e){toast({type:'error',title:e.message});}});
    container.querySelector('#plan-prev').onclick=()=>{anchor=localDay(new Date(start-days*DAY));draw();};
    container.querySelector('#plan-next').onclick=()=>{anchor=localDay(new Date(end));draw();};
    container.querySelector('#plan-existing').onclick=()=>{const latest=all.filter(r=>r.valid).sort((a,b)=>Date.parse(b.start)-Date.parse(a.start))[0];if(latest){anchor=localDay(new Date(Date.parse(latest.start)-6*DAY));draw();}};
    container.querySelector('#plan-today').onclick=()=>{anchor=localDay(new Date(Date.now()-3*DAY));draw();};
    container.querySelector('#plan-date').onchange=e=>{if(e.target.value){anchor=e.target.value;draw();}};
    container.querySelector('#plan-days').onchange=e=>{days=Number(e.target.value);draw();};
    container.querySelector('#plan-query').onchange=e=>{query=e.target.value;draw();};
    container.querySelectorAll('[data-plan]').forEach(b=>b.onclick=()=>edit(all.find(r=>r.dut.id===b.dataset.plan)));
    const colorOf=r=>['SUSPENDU','RETIRE','REJETE'].includes(r.dut.status)?'orange':r.record.stage==='DELIVERED'?'gray':['DEPARTED','ARRIVED'].includes(r.record.stage)?'green':'blue';
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
