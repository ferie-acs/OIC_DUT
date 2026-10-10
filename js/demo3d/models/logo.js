/** Texture du logo OIC dans un disque blanc, pour les toits. */
import { canvasTexture } from './kit.js';

const LOGO_URL = 'assets/images/logo-oic.jpg';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Logo introuvable : ${url}`));
    img.src = url;
  });
}

export async function loadLogoTexture() {
  const img = await loadImage(LOGO_URL);
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#FFFFFF';
    g.beginPath();
    g.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2);
    g.fill();
    // Le logo source est carré avec marges : on recadre sur le sigle et le nom.
    const crop = { sx: img.width * 0.04, sy: img.height * 0.18, sw: img.width * 0.92, sh: img.height * 0.56 };
    const dw = w * 0.78;
    const dh = dw * (crop.sh / crop.sw);
    g.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, (w - dw) / 2, (h - dh) / 2, dw, dh);
  });
}
