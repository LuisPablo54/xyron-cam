import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MODEL_URL, COLORS } from './config.js';

export { COLORS };

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

const SHELL_MATERIAL = 'ASA blanco';
const TRIM_MATERIAL = 'ASA grafito';

// Respeto los materiales de la escena de Blender y solo corrijo lo que glTF no conserva.
function styleMaterial(source, cache, rig) {
  if (cache.has(source)) return cache.get(source);
  let material;
  if (source.name === 'Policarbonato UV') {
    material = new THREE.MeshPhysicalMaterial({ color: 0x0b1218, roughness: 0.04, transparent: true, opacity: 0.18, depthWrite: false, envMapIntensity: 1.6 });
  } else if (source.name === 'Lente con recubrimiento') {
    material = new THREE.MeshPhysicalMaterial({ color: 0x0d2233, roughness: 0.03, metalness: 0.3, clearcoat: 1, envMapIntensity: 2.2 });
  } else if (source.name.startsWith('ASA')) {
    material = new THREE.MeshPhysicalMaterial({ color: source.color.clone(), roughness: 0.45, clearcoat: source.name === SHELL_MATERIAL ? 0.4 : 0.15, clearcoatRoughness: 0.35 });
  } else {
    material = source.clone();
  }
  if (source.name.startsWith('LED')) {
    material.emissiveIntensity = 3;
    material.toneMapped = false;
    rig.led = material;
  }
  if (source.name === SHELL_MATERIAL) rig.shell.push({ material, original: material.color.clone() });
  if (source.name === TRIM_MATERIAL) rig.trim.push({ material, original: material.color.clone() });
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
      child.material = styleMaterial(child.material, cache, rig);
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
