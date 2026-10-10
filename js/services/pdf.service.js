import { accessibleDut } from './workspace.service.js';
import { printPayload, fingerprint, commitPrint, nextRank } from './dut-print.service.js';
import { buildDutPdf } from './dut-pdf-layout.js?v=dut-v2';
import { qrToDataUrl } from './qr.service.js';

async function imageData(path) {
  const response=await fetch(path);
  if(!response.ok) throw new Error('Une image du document ne peut pas être chargée.');
  const blob=await response.blob();
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Image illisible.'));reader.readAsDataURL(blob);});
}
let assetsPromise;
export async function generateDutPdf(input, { copy='TRANSPORTEUR', reason='', preview=false, download=true } = {}) {
  if(!window.jspdf?.jsPDF) throw new Error('Librairie PDF non chargée.');
  assetsPromise ||= Promise.all([imageData('assets/images/logo-oic.jpg'),imageData('assets/images/armoiries-ci.png')]).catch(error=>{assetsPromise=null;throw error;});
  const [logo,emblem]=await assetsPromise;
  const dut=accessibleDut(input.id);
  if (['VALIDE','SUSPENDU','RETIRE'].includes(dut.status) && (!dut.dutNumber || !dut.qrSigned)) throw new Error('Ce dossier ne possède pas de numéro ou de QR signé. Génération impossible.');
  const rank=nextRank(dut);
  if(!preview && rank>1 && !reason.trim()) throw new Error('Le motif de réimpression est obligatoire.');
  const payload=printPayload(dut,{copy,rank});
  const hash=await fingerprint(payload);
  const qr=['VALIDE','SUSPENDU','RETIRE'].includes(dut.status)&&dut.qrSigned ? qrToDataUrl(dut.qrSigned,320) : null;
  if(dut.qrSigned && ['VALIDE','SUSPENDU','RETIRE'].includes(dut.status) && !qr) throw new Error('Le QR est indisponible. Rechargez la page avant de générer ce DUT.');
  const doc=buildDutPdf(window.jspdf.jsPDF,payload,hash,{logo,emblem,qr});
  if(!preview) commitPrint(payload,hash,reason);
  if(download) doc.save(`${dut.dutNumber||'DUT-brouillon'}-${copy.toLowerCase()}-impression-${rank}.pdf`);
  return doc;
}
