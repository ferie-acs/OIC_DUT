import { getAllUsers, getCurrentUser as storedUser } from '../repositories/users.repository.js';
import { readObject, readCollection, writeObject } from '../core/storage.js';
import { ROLE_LABELS } from '../core/constants.js';
import { uuid } from '../core/utils.js';
import { hashPassword, newAccessCode } from '../core/password.js';
import { settings, validateSettings, SETTINGS_KEY } from './settings.service.js';
export { settings };
const JOURNAL='dut_admin_events_v1';
export function requireAdmin(){
 const session=storedUser();const user=getAllUsers().find(u=>u.id===session?.id);
 if(!user || user.active===false || user.role!=='OIC_ADMIN' || (user.accessVersion||0)!==(session.accessVersion||0))throw new Error('Accès réservé à un administrateur OIC actif.');
 return user;
}
export function directory(){requireAdmin();return {users:getAllUsers().map(({credential,...u})=>u),partners:readCollection('dut_partners'),antennas:readCollection('dut_antennas'),transporters:readCollection('dut_transporters')};}
export function history(){requireAdmin();return readObject(JOURNAL,[]);}
function commit(key,value,label,target,actor){
 const logs=readObject(JOURNAL,[]);
 writeObject(JOURNAL,[{id:uuid(),label,target,actor:actor.name,at:new Date().toISOString()},...logs].slice(0,500));
 try{writeObject(key,value);}catch(err){writeObject(JOURNAL,logs);throw err;}
}
function clean(values){
 const v={name:String(values.name||'').trim(),email:String(values.email||'').trim().toLowerCase(),role:values.role};
 if(!v.name || v.name.length>100)throw new Error('Renseignez un nom de 1 à 100 caractères.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)||v.email.length>160)throw new Error('Adresse e-mail invalide.');
 if(!Object.hasOwn(ROLE_LABELS,v.role))throw new Error('Rôle inconnu.');
 if(v.role.startsWith('PARTNER_')){
  const partner=readCollection('dut_partners').find(p=>p.id===values.scope);
  if(!partner)throw new Error('Sélectionnez le partenaire de rattachement.');
  Object.assign(v,{partnerId:partner.id,partnerName:partner.name,antennaId:partner.antennaId,antennaName:partner.antennaName});
 } else if(v.role==='ANTENNA_AGENT'){
  const a=readCollection('dut_antennas').find(a=>a.id===values.scope);if(!a)throw new Error('Sélectionnez une antenne.');Object.assign(v,{antennaId:a.id,antennaName:a.name});
 } else if(v.role==='TRANSPORTEUR'){
  const t=readCollection('dut_transporters').find(t=>t.id===values.scope);if(!t)throw new Error('Sélectionnez un transporteur.');Object.assign(v,{transporterId:t.id,transporterName:t.name});
 }
 return v;
}
export async function saveUser(id,values){
 let actor=requireAdmin();const value=clean(values);const code=id?null:newAccessCode();const credential=code?await hashPassword(code):null;
 actor=requireAdmin();const list=getAllUsers();const old=id?list.find(u=>u.id===id):null;
 if(id&&!old)throw new Error('Compte introuvable.');
 if(list.some(u=>u.id!==id && u.email.toLowerCase()===value.email))throw new Error('Cette adresse e-mail est déjà utilisée.');
 if(id===actor.id && value.role!==actor.role)throw new Error('Vous ne pouvez pas modifier votre propre rôle.');
 if(old?.role==='OIC_ADMIN' && old.active!==false && value.role!=='OIC_ADMIN' && !list.some(u=>u.id!==id&&u.role==='OIC_ADMIN'&&u.active!==false))throw new Error('Conservez au moins un administrateur OIC actif.');
 const fresh={id:id||uuid(),...value,active:old?.active!==false,createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),accessVersion:old?.accessVersion||0};
 if(old?.credential)fresh.credential=old.credential;if(credential)fresh.credential=credential;
 // Lot d1 : les champs de compte (activation en attente, téléphone, administrateur d'entreprise) ne sont pas perdus à la modification.
 if(old)for(const k of ['activationPending','activation','reset','phone','activatedAt','passwordChangedAt'])if(k in old)fresh[k]=old[k];
 if(old?.companyAdmin&&old.role===value.role&&old.transporterId===value.transporterId)fresh.companyAdmin=true;
 if(old&&(old.role!==value.role||old.partnerId!==value.partnerId||old.antennaId!==value.antennaId||old.transporterId!==value.transporterId))fresh.accessVersion++;
 if(old)list[list.findIndex(u=>u.id===id)]=fresh;else list.push(fresh);
 commit('dut_users',list,old?'Compte modifié':'Compte créé',value.email,actor);return {user:fresh,code};
}
export function setActive(id,active){
 const actor=requireAdmin(),list=getAllUsers(),u=list.find(u=>u.id===id);if(!u)throw new Error('Compte introuvable.');
 if(id===actor.id)throw new Error('Vous ne pouvez pas désactiver votre propre compte.');
 if(!active && u.role==='OIC_ADMIN'&&!list.some(o=>o.id!==id&&o.role==='OIC_ADMIN'&&o.active!==false))throw new Error('Conservez au moins un administrateur OIC actif.');
 u.active=Boolean(active);u.accessVersion=(u.accessVersion||0)+1;commit('dut_users',list,active?'Compte réactivé':'Compte désactivé',u.email,actor);
}
export async function resetAccess(id){
 requireAdmin();const code=newAccessCode(),credential=await hashPassword(code);const actor=requireAdmin(),list=getAllUsers(),u=list.find(u=>u.id===id);
 if(!u)throw new Error('Compte introuvable.');if(id===actor.id)throw new Error('Demandez à un autre Admin OIC de réinitialiser votre accès.');
 u.credential=credential;u.accessVersion=(u.accessVersion||0)+1;commit('dut_users',list,'Accès réinitialisé',u.email,actor);return code;
}
export function saveSettings(values){const actor=requireAdmin();const value=validateSettings(values);commit(SETTINGS_KEY,value,'Paramètres modifiés',value.platformName,actor);return value;}
