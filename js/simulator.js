import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCity, makeDrone, makeBird } from './city.js';
import { createScout, aimRig } from './scout-model.js';
import { createRenderer, watchSize, runWhenVisible } from './renderer.js';
import { PAN_LIMIT_DEG, TILT_MIN_DEG, TILT_MAX_DEG, LENS_HFOV_DEG } from './config.js';

const RADIO_RANGE = 220;
const VISUAL_RANGE = 220;
const RADAR_RANGE = 200;
const HALF_FOV = LENS_HFOV_DEG / 2;
const ANALYZE_SECONDS = 1.2;
const LOST_SECONDS = 2.5;
const RESTART_SECONDS = 4;
const PAN_RATE = 110;
const TILT_RATE = 80;
const MANUAL_SPEED = 18;
const MAX_ZOOM = 12;
const MANUAL_MAX_DISTANCE = 200;
const SCOUT_EYE = 0.17;
const MAX_LOG = 30;
const SIM_STEP = 1 / 60;
const MAX_FRAME_SECONDS = 0.25;
const TRAIL_POINTS = 90;
const DIRECTIONS = ['Norte', 'Noreste', 'Este', 'Sureste', 'Sur', 'Suroeste', 'Oeste', 'Noroeste'];

const vec = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp3 = (a, b, k) => a.clone().lerp(b, k);
const deg = THREE.MathUtils.radToDeg;
const rad = THREE.MathUtils.degToRad;
const clamp = THREE.MathUtils.clamp;
const clockText = () => new Date().toLocaleTimeString('es-MX', { hour12: false });
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Trayectorias en metros, en ejes de Scout: x a su derecha, y arriba, z al frente.
const SCENARIOS = {
  cruce: {
    name: 'Sobrevuelo', kind: 'drone', duration: 34,
    at: (t) => lerp3(vec(-150, 45, 120), vec(90, 60, -40), t / 34),
  },
  merodeo: {
    name: 'Merodeo', kind: 'drone', duration: 48,
    at: (t) => {
      const center = vec(5, 40, 70);
      const orbit = (s) => center.clone().add(vec(35 * Math.sin(s * 0.2), 4 * Math.sin(s * 0.5), 35 * Math.cos(s * 0.2)));
      if (t < 10) return lerp3(vec(10, 70, 195), orbit(0), t / 10);
      if (t < 38) return orbit(t - 10);
      return lerp3(orbit(28), vec(-180, 80, 110), (t - 38) / 10);
    },
  },
  ave: {
    name: 'Pasa un ave', kind: 'bird', duration: 20,
    at: (t) => lerp3(vec(-90, 16, 40), vec(80, 20, 60), t / 20).add(vec(0, 1.5 * Math.sin(t * 2.2), 0)),
  },
  manual: { name: 'Manual', kind: 'drone', duration: Infinity, at: null },
};

export function init() {
  const $ = (id) => document.getElementById(id);
  const container = $('simv');
  const renderer = createRenderer(container);
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const { city, sky, ours } = buildCity(renderer.capabilities.getMaxAnisotropy());
  scene.background = sky;
  scene.fog = new THREE.Fog(0xeef5f9, 120, 560);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  scene.add(city, new THREE.HemisphereLight(0xe3f2ff, 0x9b9080, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1de, 2.6);
  sun.position.set(28, 42, 22);
  sun.target.position.set(-4, 0, -12);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 140 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const scout = new THREE.Group();
  scout.position.set(ours.rightX - 0.7, ours.roofY + 0.4, ours.frontZ + 0.09);
  scout.rotation.y = Math.PI;
  scene.add(scout);
  scout.updateMatrixWorld();
  const eye = scout.localToWorld(vec(0, SCOUT_EYE, 0));
  const drone = makeDrone();
  const bird = makeBird();
  scene.add(drone.group, bird.group);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 900);
  const lens = new THREE.PerspectiveCamera(20, 16 / 9, 0.05, 900);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.minDistance = 0.6;
  controls.maxDistance = 80;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.target.copy(eye);

  let size = { w: 1, h: 1 };
  let pip = { x: 0, y: 0, w: 1, h: 1 };
  watchSize(renderer, container, (w, h) => {
    size = { w, h };
    const narrow = w < 560;
    const pw = Math.round(w * (narrow ? 0.46 : 0.36));
    const ph = Math.round((pw * 9) / 16);
    pip = { w: pw, h: ph, x: w - pw - 12, y: narrow ? 52 : h - ph - 12 };
    Object.assign($('pipf').style, { left: `${pip.x}px`, top: `${pip.y}px`, width: `${pw}px`, height: `${ph}px` });
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    lens.aspect = pw / ph;
  });

  const sim = {
    rig: null, key: 'cruce', time: 0, ended: false, endTimer: 0,
    phase: 'idle', phaseTime: 0, lostTime: 0, birdDiscarded: false,
    pan: 0, tilt: 15, zoom: 1, clock: 0,
    record: null, trail: [], radio: false, inView: false,
    manualGoal: vec(0, 30, 40), targetLocal: vec(0, 30, 40), active: true,
    camPos: null, camLook: null, mode: 'chase', prevWorld: null,
  };

  const log = (text, kind = '') => {
    const item = document.createElement('li');
    if (kind) item.className = kind;
    item.innerHTML = `<time>${clockText()}</time><span>${text}</span>`;
    $('simlog').prepend(item);
    while ($('simlog').children.length > MAX_LOG) $('simlog').lastChild.remove();
  };

  const setPhase = (phase) => {
    sim.phase = phase;
    sim.phaseTime = 0;
  };

  const resetScenario = (key) => {
    sim.key = key;
    sim.time = 0;
    sim.ended = false;
    sim.endTimer = 0;
    sim.trail = [];
    sim.active = true;
    sim.lostTime = 0;
    sim.birdDiscarded = false;
    if (sim.record) finishRecord('cambio de escenario');
    setPhase('idle');
    if (key === 'manual') sim.targetLocal.copy(vec(-40, 30, 60));
    document.querySelectorAll('#scen button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === key)));
    $('manual').hidden = key !== 'manual';
    log(`Escenario: ${SCENARIOS[key].name}`);
  };

  const finishRecord = (reason) => {
    const record = sim.record;
    sim.record = null;
    if (!record) return;
    const compass = DIRECTIONS[Math.round(((record.bearing % 360) + 360) % 360 / 45) % 8];
    log(`Evento guardado · ${mmss(record.seconds)} · dirección ${compass} · elevación máx. ${Math.round(record.maxElevation)}° (${reason})`, 'alert');
  };

  const readManualGoal = () => {
    const azimuth = rad(Number($('mAz').value));
    const distance = Number($('mDist').value);
    const altitude = Number($('mAlt').value);
    sim.manualGoal.set(Math.sin(azimuth) * distance, altitude, Math.cos(azimuth) * distance);
    $('mAzv').textContent = `${$('mAz').value}°`;
    $('mDistv').textContent = `${distance} m`;
    $('mAltv').textContent = `${altitude} m`;
  };

  $('scen').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button) resetScenario(button.dataset.k);
  });
  ['mAz', 'mDist', 'mAlt'].forEach((id) => $(id).addEventListener('input', readManualGoal));
  $('simReset').addEventListener('click', () => resetScenario(sim.key));
  const setCameraMode = (mode) => {
    sim.mode = mode;
    controls.enabled = mode === 'free';
    renderer.domElement.style.touchAction = mode === 'free' ? 'none' : 'pan-y';
    if (mode === 'free') {
      controls.target.copy(eye);
      camera.position.copy(eye).add(vec(-3, 1.6, 4));
    }
    $('camChase').setAttribute('aria-pressed', String(mode === 'chase'));
    $('camFree').setAttribute('aria-pressed', String(mode === 'free'));
  };
  $('camChase').addEventListener('click', () => setCameraMode('chase'));
  renderer.domElement.style.touchAction = 'pan-y';
  $('camFree').addEventListener('click', () => setCameraMode('free'));

  const radar = $('radar');
  const radarContext = radar.getContext('2d');
  const radarPointer = (event) => {
    const rect = radar.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    const distance = Math.min(1, Math.hypot(x, y)) * RADAR_RANGE * 1.05;
    if (sim.key !== 'manual') resetScenario('manual');
    $('mAz').value = Math.round(deg(Math.atan2(x, -y)));
    $('mDist').value = clamp(Math.round(distance), 10, MANUAL_MAX_DISTANCE);
    readManualGoal();
  };
  radar.addEventListener('pointerdown', (event) => {
    radar.setPointerCapture(event.pointerId);
    radarPointer(event);
  });
  radar.addEventListener('pointermove', (event) => { if (radar.hasPointerCapture(event.pointerId)) radarPointer(event); });

  readManualGoal();
  resetScenario('cruce');

  createScout()
    .then((rig) => {
      sim.rig = rig;
      scout.add(rig.root);
      $('simld').remove();
    })
    .catch((error) => {
      console.error(error);
      $('simld').textContent = 'No se pudo cargar el modelo de la Scout.';
    });

  const lookDirection = (panDeg, tiltDeg) => vec(
    Math.sin(rad(panDeg)) * Math.cos(rad(tiltDeg)),
    Math.sin(rad(tiltDeg)),
    Math.cos(rad(panDeg)) * Math.cos(rad(tiltDeg)),
  );

  const approach = (value, goal, rate, dt) => value + clamp(goal - value, -rate * dt, rate * dt);

  const updateTarget = (dt) => {
    const scenario = SCENARIOS[sim.key];
    if (sim.key === 'manual') {
      const step = sim.manualGoal.clone().sub(sim.targetLocal);
      const distance = step.length();
      if (distance > 0.01) sim.targetLocal.addScaledVector(step, Math.min(1, (MANUAL_SPEED * dt) / distance));
      sim.active = true;
      return;
    }
    if (sim.ended) {
      sim.endTimer += dt;
      if (sim.endTimer > RESTART_SECONDS) resetScenario(sim.key);
      return;
    }
    sim.time += dt;
    if (sim.time >= scenario.duration) {
      sim.ended = true;
      sim.active = false;
      log('El objeto salió del área');
      return;
    }
    sim.targetLocal.copy(scenario.at(sim.time));
  };

  // Máquina de estados: patrulla → radio → verificación con IA → alerta (o ave descartada).
  const updateDetection = (dt) => {
    const kind = SCENARIOS[sim.key].kind;
    const local = sim.targetLocal;
    const distance = local.length();
    const azimuth = deg(Math.atan2(local.x, local.z));
    const elevation = deg(Math.atan2(local.y, Math.hypot(local.x, local.z)));
    const aim = lookDirection(sim.pan, sim.tilt);
    const offAxis = deg(aim.angleTo(local));
    sim.radio = sim.active && kind === 'drone' && distance < RADIO_RANGE;
    sim.inView = sim.active && offAxis < HALF_FOV && distance < VISUAL_RANGE;
    sim.phaseTime += dt;
    sim.clock += dt;

    let panGoal = 75 * Math.sin(sim.clock * 0.35);
    let tiltGoal = 22 + 12 * Math.sin(sim.clock * 0.21);
    const track = () => { panGoal = azimuth; tiltGoal = elevation; };

    if (sim.phase === 'idle') {
      if (sim.radio) {
        setPhase('radio');
        log('Señal de radio 2.4 GHz detectada · buscando con la cámara');
      } else if (sim.inView && kind === 'bird' && !sim.birdDiscarded) {
        setPhase('verify');
        log('Objeto en cámara · verificando con IA');
      }
    } else if (sim.phase === 'radio') {
      panGoal = azimuth + 4 * Math.sin(sim.clock * 1.3);
      tiltGoal = 32 + 27 * Math.sin(sim.clock * 1.2);
      if (!sim.radio) {
        setPhase('idle');
        log('Señal de radio perdida');
      } else if (sim.inView) {
        setPhase('verify');
        log('Objeto en cámara · verificando con IA');
      }
    } else if (sim.phase === 'verify') {
      track();
      sim.lostTime = sim.inView ? 0 : sim.lostTime + dt;
      if (sim.lostTime > 0.6) {
        setPhase(sim.radio ? 'radio' : 'idle');
      } else if (sim.phaseTime > ANALYZE_SECONDS) {
        if (kind === 'drone') {
          setPhase('alert');
          sim.record = { seconds: 0, bearing: azimuth, maxElevation: elevation };
          log('ALERTA: dron confirmado · grabando incidente', 'alert');
        } else {
          setPhase('bird');
          sim.birdDiscarded = true;
          log('Ave identificada · se ignora y la Scout sigue patrullando', 'bird');
        }
      }
    } else if (sim.phase === 'alert') {
      track();
      sim.record.seconds += dt;
      sim.record.maxElevation = Math.max(sim.record.maxElevation, elevation);
      sim.lostTime = sim.inView ? 0 : sim.lostTime + dt;
      if (!sim.active || sim.lostTime > LOST_SECONDS) {
        const outOfReach = Math.abs(azimuth) > PAN_LIMIT_DEG + HALF_FOV;
        finishRecord(outOfReach ? 'salió del rango de giro ±90°' : 'objetivo fuera de vista');
        setPhase(sim.radio ? 'radio' : 'idle');
      }
    } else if (sim.phase === 'bird' && sim.phaseTime > 2.5) {
      setPhase('idle');
    }

    panGoal = clamp(panGoal, -PAN_LIMIT_DEG, PAN_LIMIT_DEG);
    tiltGoal = clamp(tiltGoal, TILT_MIN_DEG, TILT_MAX_DEG);
    sim.pan = approach(sim.pan, panGoal, PAN_RATE, dt);
    sim.tilt = approach(sim.tilt, tiltGoal, TILT_RATE, dt);
    const tracking = sim.phase === 'verify' || sim.phase === 'alert';
    sim.zoom += ((tracking ? clamp(distance / 15, 1, MAX_ZOOM) : 1) - sim.zoom) * Math.min(1, dt * 3);
    return { distance, azimuth };
  };

  const BANNERS = {
    idle: ['idle', 'Patrullando el cielo'],
    radio: ['radio', 'Radio 2.4 GHz: señal de dron · buscando con la cámara'],
    verify: ['verify', 'Verificando con IA…'],
    alert: ['alert', 'ALERTA: dron · grabando incidente'],
    bird: ['bird', 'Ave identificada · ignorada, sin alerta'],
  };
  const TAGS = { verify: ['verify', 'Analizando…'], alert: ['alert', 'Dron · grabando'], bird: ['bird', 'Ave · ignorada'] };

  const updateOverlay = (world, distance) => {
    const [state, text] = BANNERS[sim.phase];
    const banner = $('sb');
    if (banner.dataset.s !== state) {
      banner.dataset.s = state;
      $('sbt').textContent = text;
    }
    $('sbtime').textContent = sim.record ? `REC ${mmss(sim.record.seconds)}` : '';
    $('rPan').textContent = `${Math.round(sim.pan)}°`;
    $('rTilt').textContent = `${Math.round(sim.tilt)}°`;
    $('rZoom').textContent = `${sim.zoom.toFixed(1)}×`;
    $('rRadio').textContent = sim.radio ? 'Detectada' : 'Sin señal';
    $('rDist').textContent = sim.active ? `${Math.round(distance)} m` : '—';
    $('rRec').textContent = sim.record ? mmss(sim.record.seconds) : '—';
    $('pipl').textContent = `Cámara Scout · 16 mm · zoom ${sim.zoom.toFixed(1)}×`;

    const ignoredBird = sim.birdDiscarded && SCENARIOS[sim.key].kind === 'bird';
    const tag = TAGS[sim.phase] ?? (ignoredBird ? TAGS.bird : null);
    placeTag($('tagMain'), tag, world, camera, { x: 0, y: 0, w: size.w, h: size.h }, distance, 1);
    placeTag($('tagPip'), tag, world, lens, pip, distance, sim.zoom);
  };

  const projected = vec(0, 0, 0);
  const placeTag = (element, tag, world, view, rect, distance, zoom) => {
    projected.copy(world).project(view);
    const visible = tag && sim.active && projected.z < 1 && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1;
    element.style.opacity = visible ? 1 : 0;
    if (!visible) return;
    const box = clamp((zoom * 900) / Math.max(distance, 1), 26, 90);
    element.dataset.k = tag[0];
    element.firstChild.textContent = tag[1];
    Object.assign(element.style, {
      left: `${rect.x + ((projected.x + 1) / 2) * rect.w}px`,
      top: `${rect.y + ((1 - projected.y) / 2) * rect.h}px`,
      width: `${box}px`,
      height: `${box}px`,
    });
  };

  const drawRadar = () => {
    const g = radarContext;
    const s = radar.width;
    const c = s / 2;
    const r = c * 0.92;
    const toRadar = (local) => [c + (local.x / RADAR_RANGE) * r, c - (local.z / RADAR_RANGE) * r];
    g.clearRect(0, 0, s, s);
    g.fillStyle = '#10161b';
    g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.05)';
    g.beginPath(); g.moveTo(c, c); g.arc(c, c, r, -Math.PI / 2 + rad(PAN_LIMIT_DEG + HALF_FOV), -Math.PI / 2 - rad(PAN_LIMIT_DEG + HALF_FOV)); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.16)';
    g.lineWidth = 2;
    g.font = '600 20px Inter, sans-serif';
    g.fillStyle = 'rgba(255,255,255,.45)';
    for (const ring of [50, 100, 150, 200]) {
      g.beginPath(); g.arc(c, c, (ring / RADAR_RANGE) * r, 0, Math.PI * 2); g.stroke();
      g.fillText(`${ring} m`, c + 8, c + (ring / RADAR_RANGE) * r - 8);
    }
    if (sim.radio) {
      g.strokeStyle = `rgba(25,184,236,${0.35 + 0.25 * Math.sin(sim.clock * 6)})`;
      g.lineWidth = 6;
      g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke();
    }
    const heading = -Math.PI / 2 + rad(sim.pan);
    const half = rad(HALF_FOV);
    const beam = g.createRadialGradient(c, c, 0, c, c, r);
    beam.addColorStop(0, 'rgba(92,214,255,.55)');
    beam.addColorStop(1, 'rgba(92,214,255,.05)');
    g.fillStyle = beam;
    g.beginPath(); g.moveTo(c, c); g.arc(c, c, r, heading - half, heading + half); g.fill();
    if (sim.trail.length > 1) {
      g.strokeStyle = sim.phase === 'alert' ? 'rgba(255,69,58,.8)' : 'rgba(255,255,255,.35)';
      g.lineWidth = 3;
      g.beginPath();
      sim.trail.forEach((point, i) => { const [x, y] = toRadar(point); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
    }
    if (sim.active) {
      const [x, y] = toRadar(sim.targetLocal);
      const colors = { alert: '#ff453a', verify: '#f5a524', bird: '#34c759' };
      g.fillStyle = colors[sim.phase] || (SCENARIOS[sim.key].kind === 'bird' ? '#9aa3ad' : '#ffffff');
      g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#5cd6ff';
    g.beginPath(); g.arc(c, c, 10, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.6)';
    g.fillText('Frente', c - 30, 30);
  };

  const followCamera = (world, dt) => {
    if (sim.mode === 'free') {
      controls.update();
      return;
    }
    const toward = sim.active ? world.clone().sub(eye).normalize() : scout.localToWorld(vec(0, SCOUT_EYE + 0.3, 1)).sub(eye).normalize();
    const flat = vec(toward.x, 0, toward.z).normalize();
    const desiredPos = eye.clone().addScaledVector(flat, -1.1).add(vec(0, 0.15, 0)).addScaledVector(vec(-flat.z, 0, flat.x), 0.35);
    const desiredLook = eye.clone().addScaledVector(flat, 5).add(vec(0, 1.06, 0));
    sim.camPos ??= desiredPos.clone();
    sim.camLook ??= desiredLook.clone();
    const k = Math.min(1, dt * 2.2);
    sim.camPos.lerp(desiredPos, k);
    sim.camLook.lerp(desiredLook, k);
    camera.position.copy(sim.camPos);
    camera.lookAt(sim.camLook);
  };

  const temp = vec(0, 0, 0);
  const forward = vec(0, 0, 0);
  const quat = new THREE.Quaternion();
  let last = 0;

  // Avanzo la simulación en pasos fijos para que el tiempo simulado no dependa de los cuadros por segundo.
  runWhenVisible(renderer, container, (now) => {
    const elapsed = last ? Math.min(now - last, MAX_FRAME_SECONDS) : SIM_STEP;
    last = now;
    const steps = Math.max(1, Math.round(elapsed / SIM_STEP));
    let distance = 0;
    for (let i = 0; i < steps; i += 1) {
      updateTarget(elapsed / steps);
      ({ distance } = updateDetection(elapsed / steps));
    }
    const world = scout.localToWorld(sim.targetLocal.clone().add(vec(0, SCOUT_EYE, 0)));
    const kind = SCENARIOS[sim.key].kind;
    drone.group.visible = sim.active && kind === 'drone';
    bird.group.visible = sim.active && kind === 'bird';
    drone.group.position.copy(world);
    bird.group.position.copy(world);
    drone.spin(now);
    bird.flap(now);
    if (sim.prevWorld && world.distanceTo(sim.prevWorld) > 1e-4) bird.group.lookAt(world.clone().add(world.clone().sub(sim.prevWorld)));
    sim.prevWorld = world.clone();
    if (sim.active) {
      sim.trail.push(sim.targetLocal.clone());
      if (sim.trail.length > TRAIL_POINTS) sim.trail.shift();
    }

    if (sim.rig) {
      aimRig(sim.rig, rad(sim.pan), rad(sim.tilt));
      if (sim.rig.led) sim.rig.led.emissiveIntensity = sim.phase === 'alert' ? 4 + 3 * Math.sin(now * 10) : 3;
      sim.rig.tilt.getWorldPosition(temp);
      sim.rig.tilt.getWorldQuaternion(quat);
    } else {
      temp.copy(eye);
      quat.setFromEuler(new THREE.Euler(-rad(sim.tilt), rad(sim.pan) + Math.PI, 0, 'YXZ'));
    }
    forward.set(0, 0, 1).applyQuaternion(quat);
    lens.position.copy(temp).addScaledVector(forward, 0.12);
    lens.lookAt(temp.clone().addScaledVector(forward, 10));
    const hfov = rad(LENS_HFOV_DEG / sim.zoom);
    lens.fov = deg(2 * Math.atan(Math.tan(hfov / 2) / lens.aspect));
    lens.updateProjectionMatrix();

    followCamera(world, elapsed);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.w, size.h);
    renderer.render(scene, camera);
    renderer.setScissorTest(true);
    const bottom = size.h - pip.y - pip.h;
    renderer.setViewport(pip.x, bottom, pip.w, pip.h);
    renderer.setScissor(pip.x, bottom, pip.w, pip.h);
    renderer.render(scene, lens);
    renderer.setScissorTest(false);

    updateOverlay(world, distance);
    drawRadar();
  });
}
