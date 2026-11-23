import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { COLORS, createScout, onModelProgress, paintRig, setExplode, aimRig } from './scout-model.js';
import { createRenderer, watchSize, runWhenVisible, prefersReducedMotion } from './renderer.js';

const FLY_SECONDS = 0.9;
const vec = (values) => new THREE.Vector3(...values);
const ease = (x) => x * x * (3 - 2 * x);

const VIEWS = {
  general: { label: 'General', cam: [-0.42, 0.26, 0.78], target: [0, 0.13, 0], pan: -15, tilt: 8, explode: 0, title: 'Diseño limpio para cualquier fachada', text: 'Cuerpo blanco, aro grafito y una barra LED que te dice su estado de un vistazo. Pensada para verse bien en una azotea, no para esconderse.' },
  movimiento: { label: 'Movimiento', cam: [-0.5, 0.32, 0.74], target: [0, 0.14, 0], scan: true, explode: 0, title: 'Gira, inclina y no lo pierde', text: 'Giro de ±90° e inclinación de −10° a +90°: puede mirar el horizonte o justo encima de tu casa mientras sigue al dron.' },
};

export function init() {
  const $ = (id) => document.getElementById(id);
  const container = $('sv');
  const reduce = prefersReducedMotion();
  const renderer = createRenderer(container, { alpha: true, toneMapping: THREE.AgXToneMapping });
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-0.6, 0.9, 0.7);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(2048);
  Object.assign(key.shadow.camera, { left: -0.45, right: 0.45, top: 0.45, bottom: -0.45 });
  key.shadow.radius = 6;
  key.shadow.bias = -0.0004;
  scene.add(key);
  for (const side of [-1, 1]) {
    const rim = new THREE.DirectionalLight(0xe6eeff, 1.4);
    rim.position.set(side * 0.7, 0.35, -0.6);
    scene.add(rim);
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 20);
  camera.position.set(...VIEWS.general.cam);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...VIEWS.general.target);
  controls.enableDamping = true;
  controls.minDistance = 0.25;
  controls.maxDistance = 2.4;
  controls.maxPolarAngle = Math.PI * 0.53;
  controls.autoRotateSpeed = 1.6;
  watchSize(renderer, container, (w, h) => {
    camera.aspect = w / h;
    camera.fov = w < 600 ? 36 : 28;
    camera.updateProjectionMatrix();
  });

  const state = { pan: -15, tilt: 8, explode: 0, panGoal: -15, tiltGoal: 8, explodeGoal: 0, scan: false, view: 'general' };
  let rig = null;
  let fly = null;

  $('views').innerHTML = Object.entries(VIEWS)
    .map(([k, view]) => `<button type="button" data-k="${k}" aria-pressed="${k === 'general'}">${view.label}</button>`).join('');
  $('sw').innerHTML = COLORS
    .map((color, i) => `<button type="button" data-i="${i}" aria-label="${color.name}" aria-pressed="${i === 0}" style="background:${color.swatch}"></button>`).join('');

  const show = (k, animate = true) => {
    const view = VIEWS[k];
    state.view = k;
    $('ct').textContent = view.title;
    $('cd').textContent = view.text;
    document.querySelectorAll('#views button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
    fly = animate ? { fromCam: camera.position.clone(), toCam: vec(view.cam), fromTarget: controls.target.clone(), toTarget: vec(view.target), t: 0 } : null;
    state.scan = Boolean(view.scan);
    if (!view.scan) {
      state.panGoal = view.pan;
      state.tiltGoal = view.tilt;
    }
    state.explodeGoal = view.explode;
    $('ex').value = view.explode;
  };

  $('views').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button) show(button.dataset.k);
  });
  $('sw').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const index = Number(button.dataset.i);
    document.querySelectorAll('#sw button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    $('cname').textContent = COLORS[index].name;
    if (rig) paintRig(rig, index);
  });
  $('ex').addEventListener('input', (event) => { state.explodeGoal = Number(event.target.value); });
  $('btnSpin').addEventListener('click', (event) => {
    controls.autoRotate = !controls.autoRotate;
    event.currentTarget.setAttribute('aria-pressed', String(controls.autoRotate));
  });
  $('btnReset').addEventListener('click', () => show(state.view));
  $('btnFull').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else container.requestFullscreen?.().catch(() => {});
  });
  if (!container.requestFullscreen) $('btnFull').hidden = true;
  show('general', false);

  onModelProgress((p) => {
    const label = $('sld');
    if (label) label.textContent = `Cargando modelo… ${Math.round(p * 100)} %`;
  });
  createScout()
    .then((loaded) => {
      rig = loaded;
      scene.add(rig.root);
      $('sld').remove();
      const selected = document.querySelector('#sw [aria-pressed=true]');
      paintRig(rig, Number(selected.dataset.i));
    })
    .catch((error) => {
      console.error(error);
      $('sld').textContent = 'No se pudo cargar el modelo.';
    });

  const clock = new THREE.Clock();
  runWhenVisible(renderer, container, () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (state.scan && !reduce) {
      state.panGoal = 70 * Math.sin(t * 0.7);
      state.tiltGoal = 30 + 25 * Math.sin(t * 0.45);
    }
    state.pan += (state.panGoal - state.pan) * 0.1;
    state.tilt += (state.tiltGoal - state.tilt) * 0.1;
    state.explode += (state.explodeGoal - state.explode) * 0.08;
    $('exv').textContent = `${Math.round(state.explode)} %`;
    if (fly) {
      fly.t = Math.min(1, fly.t + dt / FLY_SECONDS);
      const k = ease(fly.t);
      camera.position.lerpVectors(fly.fromCam, fly.toCam, k);
      controls.target.lerpVectors(fly.fromTarget, fly.toTarget, k);
      if (fly.t >= 1) fly = null;
    }
    if (rig) {
      const opened = ease(state.explode / 100);
      aimRig(rig, THREE.MathUtils.degToRad(state.pan) * (1 - opened), THREE.MathUtils.degToRad(state.tilt) * (1 - opened));
      setExplode(rig, opened);
      if (rig.led) rig.led.emissiveIntensity = 4;
      floor.visible = state.explode < 5;
    }
    controls.update();
    renderer.render(scene, camera);
  });
}
