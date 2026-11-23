import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MODEL_URL } from './config.js';

export const COLORS = [
  { name: 'Blanco ártico', swatch: '#f3f4f5', shell: null, trim: null },
  { name: 'Grafito', swatch: '#3b3f45', shell: '#3d4148', trim: '#141619' },
  { name: 'Arena', swatch: '#d8ccb9', shell: '#d6cab6', trim: '#5d544a' },
];

const EXPECTED_BYTES = 2.8e6;
const progressListeners = new Set();
let bufferPromise = null;

function fetchModel() {
  return fetch(MODEL_URL).then((response) => {
    if (!response.ok) throw new Error(`Modelo: ${response.status}`);
    const total = Number(response.headers.get('content-length')) || EXPECTED_BYTES;
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    const pump = () => reader.read().then(({ done, value }) => {
      if (done) return new Blob(chunks).arrayBuffer();
      chunks.push(value);
      received += value.length;
      progressListeners.forEach((listener) => listener(Math.min(1, received / total)));
      return pump();
    });
    return pump();
  });
}

export function onModelProgress(listener) {
  progressListeners.add(listener);
}

// Descargo el GLB una sola vez y cada escena lo interpreta por separado.
export async function createScout() {
  bufferPromise ??= fetchModel();
  const buffer = await bufferPromise;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(buffer.slice(0), '');
  return prepareRig(gltf.scene);
}

const luminance = (color) => 0.3 * color.r + 0.59 * color.g + 0.11 * color.b;

function styleMaterial(partName, source, cache, rig) {
  if (cache.has(source)) return cache.get(source);
  let material;
  if (partName.startsWith('C01_ventana')) {
    material = new THREE.MeshPhysicalMaterial({ color: 0x0b1218, roughness: 0.04, transparent: true, opacity: 0.2, depthWrite: false, envMapIntensity: 1.6 });
  } else if (partName.startsWith('C02_lente_vidrio')) {
    material = new THREE.MeshPhysicalMaterial({ color: 0x0d2233, roughness: 0.03, metalness: 0.3, clearcoat: 1, envMapIntensity: 2.2 });
  } else if (partName.startsWith('01c_led')) {
    material = source.clone();
    material.emissiveIntensity = 3;
    material.toneMapped = false;
    rig.led = material;
  } else {
    const color = source.color.clone();
    const light = luminance(color);
    if (light > 0.5) {
      material = new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 });
      rig.shell.push({ material, original: color.clone() });
    } else if (light < 0.12) {
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.36, metalness: 0.55 });
      rig.trim.push({ material, original: color.clone() });
    } else {
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.15 });
    }
  }
  cache.set(source, material);
  return material;
}

function prepareRig(root) {
  const rig = { root, pan: null, tilt: null, led: null, parts: [], shell: [], trim: [] };
  const cache = new Map();
  root.traverse((node) => {
    if (node.name === 'PAN') rig.pan = node;
    if (node.name === 'TILT') rig.tilt = node;
    const explode = node.userData?.ex;
    if (!Array.isArray(explode)) return;
    rig.parts.push({
      node,
      base: node.position.clone(),
      offset: new THREE.Vector3(explode[0], explode[2], -explode[1]).multiplyScalar(0.001),
    });
    node.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.material = styleMaterial(node.name, child.material, cache, rig);
    });
  });
  return rig;
}

export function paintRig(rig, index) {
  const color = COLORS[index];
  rig.shell.forEach(({ material, original }) => (color.shell ? material.color.set(color.shell) : material.color.copy(original)));
  rig.trim.forEach(({ material, original }) => (color.trim ? material.color.set(color.trim) : material.color.copy(original)));
}

export function setExplode(rig, amount) {
  rig.parts.forEach(({ node, base, offset }) => node.position.copy(base).addScaledVector(offset, amount));
}

export function aimRig(rig, panRad, tiltRad) {
  rig.pan.rotation.y = panRad;
  rig.tilt.rotation.x = -tiltRad;
}
