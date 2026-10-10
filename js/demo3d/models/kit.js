/** Briques de construction des maquettes « jouet » : formes arrondies, aucun contour. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const materials = new Map();

export function mat(hex, opts = {}) {
  const key = `${hex}|${JSON.stringify(opts)}`;
  if (!materials.has(key)) {
    materials.set(key, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.72, metalness: 0, ...opts }));
  }
  return materials.get(key);
}

/** Couleur assombrie (k < 1) ou éclaircie (k > 1). */
export function shade(hex, k) {
  return `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;
}

function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Pavé à angles arrondis, centré sur son origine. */
export function rbox(w, h, d, r, hex, opts) {
  const radius = Math.min(r, w / 2, h / 2, d / 2);
  return shadowed(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, radius), mat(hex, opts)));
}

export function cyl(rTop, rBottom, h, hex, seg = 20) {
  return shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), mat(hex)));
}

/** Surface plane au sol (marquage, dalle, route). */
export function flat(w, d, hex, y = 0.01) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(hex, { roughness: 1 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

export function at(obj, x, y, z) {
  obj.position.set(x, y, z);
  return obj;
}

export function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Plan texturé (enseigne, livrée), face vers +z. */
export function decal(w, h, texture) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.8 }),
  );
}

let shadowTexture = null;
/** Ombre de contact floue posée au sol sous un objet. */
export function contactShadow(w, d, opacity = 0.32) {
  shadowTexture ??= canvasTexture(128, 128, (g, W, H) => {
    const grad = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
    grad.addColorStop(0, 'rgba(18, 32, 58, 1)');
    grad.addColorStop(1, 'rgba(18, 32, 58, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  });
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.04;
  m.renderOrder = 1;
  return m;
}
