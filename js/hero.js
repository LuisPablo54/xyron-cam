import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCity, makeDrone } from './city.js';
import { createScout, onModelProgress, aimRig } from './scout-model.js';
import { createRenderer, watchSize, runWhenVisible, prefersReducedMotion } from './renderer.js';

const PAN_LIMIT = Math.PI / 2;
const TILT_MIN = -0.17;
const TILT_MAX = Math.PI / 2;
const SCOUT_EYE = 0.17;
const vec = (x, y, z) => new THREE.Vector3(x, y, z);

export function init() {
  const $ = (id) => document.getElementById(id);
  const container = $('hs');
  const lock = $('lock');
  const hud = $('hud');
  const reduce = prefersReducedMotion();
  const renderer = createRenderer(container);
  renderer.toneMappingExposure = 1.05;
  const isSmall = innerWidth < 700;

  const scene = new THREE.Scene();
  const { city, sky, ours } = buildCity(renderer.capabilities.getMaxAnisotropy());
  scene.background = sky;
  scene.fog = new THREE.Fog(0xeef5f9, 40, 330);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  scene.add(city);
  scene.add(new THREE.HemisphereLight(0xe3f2ff, 0x9b9080, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1de, 2.6);
  sun.position.set(28, 42, 22);
  sun.target.position.set(-4, 0, -12);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(isSmall ? 2048 : 4096);
  Object.assign(sun.shadow.camera, { left: -46, right: 46, top: 46, bottom: -46, near: 1, far: 140 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const scout = new THREE.Group();
  scout.position.set(ours.rightX - 0.7, ours.roofY + 0.4, ours.frontZ + 0.09);
  scout.rotation.y = Math.atan2(-1, -0.55);
  scene.add(scout);
  const eye = scout.position.clone().add(vec(0, SCOUT_EYE, 0));
  const drone = makeDrone();
  scene.add(drone.group);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 800);
  const lens = new THREE.PerspectiveCamera(13, 1, 0.05, 800);
  let width = 1;
  let height = 1;
  let wide = true;
  let mode = 'ext';
  let rig = null;
  let pan = 0;
  let tilt = 0.4;
  let mouseX = 0;
  let mouseY = 0;

  watchSize(renderer, container, (w, h) => {
    width = w;
    height = h;
    wide = w >= 700;
    if (wide) {
      camera.fov = 34;
      camera.aspect = (w * 1.5) / h;
      camera.setViewOffset(w * 1.5, h, 0, 0, w, h);
    } else {
      camera.clearViewOffset();
      camera.fov = 50;
      camera.aspect = w / h;
    }
    camera.updateProjectionMatrix();
    lens.aspect = w / h;
    lens.fov = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(11)) / Math.min(lens.aspect, 2.2)) * 180) / Math.PI;
    lens.updateProjectionMatrix();
  });

  container.addEventListener('pointermove', (event) => {
    const rect = container.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) / rect.width - 0.5;
    mouseY = (event.clientY - rect.top) / rect.height - 0.5;
  });
  const setMode = (next) => {
    mode = next;
    $('vExt').setAttribute('aria-pressed', String(next === 'ext'));
    $('vCam').setAttribute('aria-pressed', String(next === 'cam'));
    hud.classList.toggle('on', next === 'cam');
  };
  $('vExt').addEventListener('click', () => setMode('ext'));
  $('vCam').addEventListener('click', () => setMode('cam'));

  onModelProgress((p) => { $('hli').style.width = `${Math.round(p * 100)}%`; });
  createScout()
    .then((loaded) => {
      rig = loaded;
      scout.add(rig.root);
      $('hl').remove();
      $('chip').classList.add('live');
      $('chip').lastChild.textContent = 'Dron detectado · siguiendo';
    })
    .catch((error) => {
      console.error(error);
      $('hl').firstChild.textContent = 'No se pudo cargar el modelo de la Scout.';
    });

  const temp = vec(0, 0, 0);
  const forward = vec(0, 0, 0);
  const quat = new THREE.Quaternion();
  const projected = vec(0, 0, 0);
  const start = performance.now() / 1000;

  runWhenVisible(renderer, container, (now) => {
    const t = reduce ? 6 : now - start + 6;
    const target = eye.clone().add(vec(-6.5 + 3.2 * Math.sin(t * 0.27), 2.3 + 0.7 * Math.sin(t * 0.5), -7.6 + 2.2 * Math.cos(t * 0.27)));
    drone.group.position.copy(target);
    drone.group.rotation.set(0.08 * Math.sin(t * 0.4), t * 0.15, -0.12 * Math.cos(t * 0.27));
    drone.spin(t);

    if (rig) {
      const local = scout.worldToLocal(target.clone()).sub(vec(0, SCOUT_EYE, 0));
      const panGoal = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -PAN_LIMIT, PAN_LIMIT);
      const tiltGoal = THREE.MathUtils.clamp(Math.atan2(local.y, Math.hypot(local.x, local.z)), TILT_MIN, TILT_MAX);
      pan += (panGoal - pan) * 0.06;
      tilt += (tiltGoal - tilt) * 0.06;
      aimRig(rig, pan, tilt);
      if (rig.led) rig.led.emissiveIntensity = 3 + 1.5 * Math.sin(t * 3);
      $('hudr').textContent = `Pan ${Math.round(THREE.MathUtils.radToDeg(pan))}° · Tilt ${Math.round(THREE.MathUtils.radToDeg(tilt))}°`;
    }

    let view = camera;
    if (mode === 'cam' && rig) {
      rig.tilt.getWorldPosition(temp);
      rig.tilt.getWorldQuaternion(quat);
      forward.set(0, 0, 1).applyQuaternion(quat);
      lens.position.copy(temp).addScaledVector(forward, 0.12);
      lens.lookAt(temp.clone().addScaledVector(forward, 10));
      view = lens;
    } else {
      const offset = wide ? vec(0.55, 0.13, 1.15) : vec(0.8, 0.24, 1.75);
      camera.position.copy(eye).add(offset).add(vec(Math.sin(t * 0.2) * 0.05 + mouseX * 0.12, Math.sin(t * 0.27) * 0.03 - mouseY * 0.06, 0));
      camera.lookAt(camera.position.clone().add((wide ? vec(-0.42, 0.07, -1) : vec(-0.4, 0, -1)).multiplyScalar(10)));
    }
    renderer.render(scene, view);

    projected.copy(target).project(view);
    const onScreen = projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05;
    lock.style.left = `${((projected.x + 1) / 2) * width}px`;
    lock.style.top = `${((1 - projected.y) / 2) * height}px`;
    lock.style.opacity = onScreen && rig ? 1 : 0;
    lock.style.transform = `scale(${mode === 'cam' ? 1.5 : 1})`;
  });
}
