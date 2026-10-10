/** Renderer, caméra orthographique isométrique, lumières. */
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { frustum } from './timeline.js';

const ISO_DIR = new THREE.Vector3(1, 0.95, 1).normalize();
const CAMERA_DISTANCE = 220;
const SUN_OFFSET = new THREE.Vector3(-45, 85, 35);
const SHADOW_HALF = 75;

export function createStage(canvas, { preserveDrawingBuffer }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(PALETTE.fond);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 800);

  scene.add(new THREE.HemisphereLight(PALETTE.cielHemi, PALETTE.solHemi, 1.7));
  const sun = new THREE.DirectionalLight(PALETTE.soleil, 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -SHADOW_HALF, right: SHADOW_HALF, top: SHADOW_HALF, bottom: -SHADOW_HALF, near: 1, far: 320 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);

  const target = new THREE.Vector3();
  const size = new THREE.Vector2();
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.getSize(size);
    if (size.x !== w || size.y !== h) renderer.setSize(w, h, false);
    return w / h;
  }

  function frame({ x, z, zoom }) {
    const { halfW, halfH } = frustum(resize(), zoom);
    Object.assign(camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
    target.set(x, 0, z);
    camera.position.copy(target).addScaledVector(ISO_DIR, CAMERA_DISTANCE);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    sun.position.copy(target).add(SUN_OFFSET);
    sun.target.position.copy(target);
    sun.target.updateMatrixWorld();
  }

  return { renderer, scene, camera, frame, render: () => renderer.render(scene, camera) };
}
