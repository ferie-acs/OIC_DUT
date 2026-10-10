// Contacts transcrits de LISTE ANTENNE.pdf fourni le 21/09/2026.
// Repères indicatifs de localités, pas les coordonnées des bureaux.
// Takikro : localité du Gontougo, repère ARTCI (rapport QoS 2019).
const rows = [
 ['ABIDJAN SIEGE','Abidjan','21 00 55 22 / 21 25 99 33',5.2893,-4.0072],
 ['ABIDJAN YOPOUGON','Abidjan · Yopougon','08 11 20 17',5.336,-4.075],
 ['ABIDJAN VRIDI','Abidjan · Vridi','01 18 68 91',5.257,-3.986],
 ['ABENGOUROU','Abengourou','02 03 48 00',6.7297,-3.4964],
 ['ABOISSO','Aboisso','03 32 31 94',5.467,-3.207],
 ['ADZOPE','Adzopé','01 22 54 86',6.107,-3.861],
 ['BONDOUKOU','Bondoukou','02 01 75 71 / 05 83 83 32',8.04,-2.8],
 ['BOUAKE','Bouaké','01 02 89 99',7.6906,-5.03],
 ['BOUNA','Bouna','41 32 76 63',9.269,-2.995],
 ['BOUNDIALI','Boundiali','07 93 77 86',9.521,-6.486],
 ['DALOA','Daloa','02 95 48 25',6.877,-6.45],
 ['DUEKOUE','Duékoué','71 41 47 72',6.742,-7.349],
 ['GAGNOA','Gagnoa','02 83 20 45',6.131,-5.951],
 ['KORHOGO','Korhogo','01 46 31 47',9.458,-5.63],
 ['MAN','Man','01 80 12 61',7.412,-7.554],
 ['NOE','Noé · Sud-Comoé','08 41 81 79 / 74 68 21 16',5.294,-2.785],
 ['ODIENNE','Odienné','08 31 22 93',9.505,-7.565],
 ['OUANGOLO','Ouangolodougou','01 94 87 36',9.969,-5.149],
 ['POGO','Pogo','03 91 44 93',10.43728,-5.63084],
 ['SAN PEDRO','San-Pédro','05 13 90 01',4.7485,-6.6363],
 ['SOUBRE','Soubré','02 03 31 55',5.785,-6.608],
 ['TAKIKRO','Takikro · Gontougo','41 67 91 64',7.239,-2.96],
 ['YAMOUSSOUKRO','Yamoussoukro','02 03 26 38',6.8276,-5.2893],
];
export const officialAntennas=rows.map(([name,city,phone,lat,lng],index)=>({id:`oic-antenna-${index+1}`,name,city,phone,lat,lng,address:'Adresse précise non fournie',hours:'Non renseignés',demoLocation:true,source:'LISTE ANTENNE.pdf',directoryVersion:1}));
const normalize=name=>String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
/** Zone géographique indicative d'après la position (Sud côtier, Nord, Ouest, Est, Centre). */
export function zoneOf({lat,lng}){
 if(lat<6.2)return 'Sud';
 if(lat>8.6)return 'Nord';
 if(lng<-6.3)return 'Ouest';
 if(lng>-3.9)return 'Est';
 return 'Centre';
}

// Encadrement de démonstration : noms ivoiriens plausibles, déterministes par antenne.
// Données fictives — à remplacer par le référentiel RH de l'OIC.
const PRENOMS=['Kouassi','Aminata','Yao','Mariam','Koffi','Adjoua','Seydou','Nadège','Brou','Fatoumata','Ibrahim','Akissi','Moussa','Affoué','Souleymane','Ahou','Lacina','Désirée','Konan','Awa','Drissa','Gnamien','Salimata'];
const NOMS=['Koné','N’Guessan','Traoré','Kouamé','Diabaté','Yapo','Ouattara','Bamba','Assi','Coulibaly','Kouadio','Soro','Tanoh','Cissé','Gbagbo','Diomandé','Touré','Aka','Fofana','Ehouman','Silué','Brou','Sanogo'];
export function antennaLeadership(index,name){
 const i=Math.abs(Number(index)||0);
 const chef=`${PRENOMS[i%PRENOMS.length]} ${NOMS[(i*7+3)%NOMS.length]}`;
 const adjoint=`${PRENOMS[(i*5+11)%PRENOMS.length]} ${NOMS[(i*3+9)%NOMS.length]}`;
 const slug=normalize(name).toLowerCase().slice(0,14);
 const phone=`07 ${String(10+(i*37)%89).padStart(2,'0')} ${String(10+(i*53)%89).padStart(2,'0')} ${String(10+(i*71)%89).padStart(2,'0')} ${String(10+(i*13)%89).padStart(2,'0')}`;
 return {chef:{name:chef,phone,email:`chef.${slug}@oic.ci`},adjoint:{name:adjoint},effectif:2+(i*5)%6,hours:'Lun.–Ven. 7 h 30 – 16 h 30'};
}

/** Complète une antenne avec son encadrement de démonstration si elle n'en a pas. */
export function withLeadership(antenna,index){
 if(antenna.chef?.name)return antenna;
 const lead=antennaLeadership(index,antenna.name);
 return {...antenna,...lead,hours:antenna.hours&&antenna.hours!=='Non renseignés'?antenna.hours:lead.hours};
}

export function mergeAntennaDirectory(existing){
 const used=new Set();
 const merged=officialAntennas.map(entry=>{
  const previous=existing.find(a=>normalize(a.name)===normalize(entry.name)||(entry.name==='ABIDJAN SIEGE'&&normalize(a.name)==='ABIDJAN'));
  if(previous)used.add(previous.id);
  // Keep identifiers so DUTs, accounts and partners retain their attachments.
  return previous?.directoryVersion===1?previous:{...previous,...entry,id:previous?.id||entry.id};
 });
 return [...merged,...existing.filter(a=>!used.has(a.id)&&!merged.some(b=>b.id===a.id))].map((a,i)=>withLeadership(a,i));
}
