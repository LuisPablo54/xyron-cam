import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCity, makeDrone, makeBird } from './city.js';
import { createScout, aimRig } from './scout-model.js';
import { createRenderer, watchSize, runWhenVisible } from './renderer.js';
import { TILT_MIN_DEG, TILT_MAX_DEG, LENS_HFOV_DEG } from './config.js';

const RADIO_RANGE = 150;
const PULSE_SECONDS = 1.6;
const BAND_START_MHZ = 2400;
const BAND_BINS = 84;
const WIFI_CHANNELS_MHZ = [2412, 2437, 2462];
const HOP_SECONDS = 0.12;
const HOPS = 4;
const DBM_MIN = -100;
const DBM_MAX = -30;
const DETECT_DBM = -80;
const DETECT_RANGE = 130;
const TRACK_RANGE = 200;
const RADAR_RANGE = 200;
const HALF_FOV = LENS_HFOV_DEG / 2;
const ANALYZE_SECONDS = 1.2;
const LOST_SECONDS = 2.5;
const RESTART_SECONDS = 4;
const PATROL_RATE = 36;
const SEARCH_RATE = 120;
const SPIN_ACCEL = 90;
const SEARCH_TILT = [8, 60];
const SEARCH_SWEEP_SECONDS = 9;
const PAN_RATE = 110;
const TILT_RATE = 80;
const MAX_ZOOM = 12;
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
const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
const triangle = (x) => 1 - Math.abs((((x % 2) + 2) % 2) - 1);
const clockText = () => new Date().toLocaleTimeString('es-MX', { hour12: false });
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Trayectorias en metros, en ejes de Scout: x a su derecha, y arriba, z al frente.
const SCENARIOS = {
  // Entra de frente a ~200 m, pasa cerca por encima y sale por detrás: la radio lo oye antes de que la cámara pueda verlo.
  cruce: {
    name: 'Sobrevuelo', kind: 'drone', duration: 40,
    at: (t) => lerp3(vec(-125, 40, 150), vec(165, 65, -115), t / 40),
  },
  ave: {
    name: 'Pasa un ave', kind: 'bird', duration: 22,
    at: (t) => lerp3(vec(-90, 16, 40), vec(80, 20, 60), t / 22).add(vec(0, 1.5 * Math.sin(t * 2.2), 0)),
  },
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

  let size = { w: 1, h: 1 };
  let pip = { x: 0, y: 0, w: 1, h: 1 };
  watchSize(renderer, container, (w, h) => {
    size = { w, h };
    const narrow = w < 560;
    const pw = Math.round(w * (narrow ? 0.46 : 0.32));
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
    pulseFront: 0, radioLock: false, inRange: false, hitFlash: 0, hops: [], hopTime: 0, spectrumTick: 0,
    pan: 0, tilt: 15, zoom: 1, clock: 0, spin: 0, panSpeed: 0,
    record: null, trail: [], radio: false, inView: false,
    targetLocal: vec(0, 30, 40), active: true,
    camPos: null, camLook: null, prevWorld: null,
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
    sim.radioLock = false;
    if (sim.record) finishRecord('cambio de escenario');
    setPhase('idle');
    document.querySelectorAll('#scen button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === key)));
    log(`Escenario: ${SCENARIOS[key].name}`);
  };

  const finishRecord = (reason) => {
    const record = sim.record;
    sim.record = null;
    if (!record) return;
    const compass = DIRECTIONS[Math.round(((record.bearing % 360) + 360) % 360 / 45) % 8];
    log(`Evento guardado · ${mmss(record.seconds)} · dirección ${compass} · elevación máx. ${Math.round(record.maxElevation)}° (${reason})`, 'alert');
  };

  $('scen').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button) resetScenario(button.dataset.k);
  });
  $('simReset').addEventListener('click', () => resetScenario(sim.key));

  const radar = $('radar');
  const radarContext = radar.getContext('2d');
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

  // Máquina de estados: patrulla → alerta temprana por radio → verificación con IA → alerta (o ave descartada).
  // La radio solo dice que hay un dron cerca, no dónde: en alerta temprana la cámara gira más rápido y barre
  // el cielo en espiral hasta que lo encuentra.
  const updateDetection = (dt) => {
    const kind = SCENARIOS[sim.key].kind;
    const local = sim.targetLocal;
    const distance = local.length();
    const azimuth = deg(Math.atan2(local.x, local.z));
    const elevation = deg(Math.atan2(local.y, Math.hypot(local.x, local.z)));
    const aim = lookDirection(sim.pan, sim.tilt);
    const offAxis = deg(aim.angleTo(local));
    sim.phaseTime += dt;
    sim.clock += dt;
    const inRange = sim.active && kind === 'drone' && distance < RADIO_RANGE;
    const previousFront = sim.pulseFront;
    sim.pulseFront = ((sim.clock % PULSE_SECONDS) / PULSE_SECONDS) * RADIO_RANGE;
    const crossed = previousFront <= sim.pulseFront ? distance > previousFront && distance <= sim.pulseFront : distance <= sim.pulseFront;
    if (inRange && !sim.radioLock && crossed) {
      sim.radioLock = true;
      sim.hitFlash = 1;
      log('Radio 2.4 GHz: señal de control de un dron detectada');
    }
    if (!inRange) sim.radioLock = false;
    sim.hitFlash = Math.max(0, sim.hitFlash - dt * 1.2);
    sim.inRange = inRange;
    sim.radio = sim.radioLock && inRange;
    const tracking = sim.phase === 'verify' || sim.phase === 'alert';
    sim.inView = sim.active && offAxis < HALF_FOV && distance < (tracking ? TRACK_RANGE : DETECT_RANGE);

    if (sim.phase === 'idle') {
      if (sim.radio) {
        setPhase('radio');
        log('Alerta temprana: la cámara acelera el giro y barre todo el cielo');
      } else if (sim.inView && !(kind === 'bird' && sim.birdDiscarded)) {
        setPhase('verify');
        log('Objeto en cámara · verificando con IA');
      }
    } else if (sim.phase === 'radio') {
      if (!sim.radio) {
        setPhase('idle');
        log('Señal de radio perdida · vuelve la patrulla normal');
      } else if (sim.inView) {
        setPhase('verify');
        log('Objeto en cámara · verificando con IA');
      }
    } else if (sim.phase === 'verify') {
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
      sim.record.seconds += dt;
      sim.record.maxElevation = Math.max(sim.record.maxElevation, elevation);
      sim.lostTime = sim.inView ? 0 : sim.lostTime + dt;
      if (!sim.active || sim.lostTime > LOST_SECONDS) {
        finishRecord(sim.active ? 'objetivo fuera de alcance' : 'salió del área');
        setPhase(sim.radio ? 'radio' : 'idle');
      }
    } else if (sim.phase === 'bird' && sim.phaseTime > 2.5) {
      setPhase('idle');
    }

    const previousPan = sim.pan;
    let tiltGoal;
    if (sim.phase === 'verify' || sim.phase === 'alert') {
      sim.spin = 0;
      sim.pan += clamp(wrap180(azimuth - sim.pan), -PAN_RATE * dt, PAN_RATE * dt);
      tiltGoal = elevation;
    } else {
      const searching = sim.phase === 'radio';
      sim.spin = approach(sim.spin, searching ? SEARCH_RATE : PATROL_RATE, SPIN_ACCEL, dt);
      sim.pan += sim.spin * dt;
      tiltGoal = searching
        ? SEARCH_TILT[0] + (SEARCH_TILT[1] - SEARCH_TILT[0]) * triangle(sim.phaseTime / SEARCH_SWEEP_SECONDS)
        : 15 + 5 * Math.sin(sim.clock * 0.5);
    }
    sim.pan = wrap180(sim.pan);
    sim.panSpeed += (Math.abs(wrap180(sim.pan - previousPan)) / dt - sim.panSpeed) * Math.min(1, dt * 4);
    sim.tilt = approach(sim.tilt, clamp(tiltGoal, TILT_MIN_DEG, TILT_MAX_DEG), TILT_RATE, dt);
    const zoomed = sim.phase === 'verify' || sim.phase === 'alert';
    sim.zoom += ((zoomed ? clamp(distance / 15, 1, MAX_ZOOM) : 1) - sim.zoom) * Math.min(1, dt * 3);
    return { distance, azimuth };
  };

  const BANNERS = {
    idle: ['idle', 'Patrullando el cielo · giro 360°'],
    radio: ['radio', 'Alerta temprana · barrido rápido'],
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
    $('rPan').textContent = `${Math.round((sim.pan + 360) % 360)}°`;
    $('rTilt').textContent = `${Math.round(sim.tilt)}°`;
    $('rSpeed').textContent = `${Math.round(sim.panSpeed)}°/s`;
    $('rRadio').textContent = sim.radio ? 'Detectada' : sim.inRange ? 'En rango' : 'Sin señal';
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
    g.fillStyle = '#0e1011';
    g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.16)';
    g.lineWidth = 2;
    g.font = '400 20px "DM Mono", monospace';
    g.fillStyle = 'rgba(255,255,255,.45)';
    for (const ring of [50, 100, 150, 200]) {
      g.beginPath(); g.arc(c, c, (ring / RADAR_RANGE) * r, 0, Math.PI * 2); g.stroke();
      g.fillText(`${ring} m`, c + 8, c + (ring / RADAR_RANGE) * r - 8);
    }
    // La radio no da dirección: al detectar, se enciende todo su alcance, no un punto.
    const radioRadius = (RADIO_RANGE / RADAR_RANGE) * r;
    if (sim.radio) {
      g.fillStyle = `rgba(255,69,58,${0.07 + 0.05 * Math.sin(sim.clock * 5)})`;
      g.beginPath(); g.arc(c, c, radioRadius, 0, Math.PI * 2); g.fill();
    }
    g.setLineDash(sim.radio ? [] : [10, 8]);
    g.strokeStyle = sim.radio ? 'rgba(255,69,58,.9)' : 'rgba(255,69,58,.55)';
    g.lineWidth = 2 + 8 * sim.hitFlash;
    g.beginPath(); g.arc(c, c, radioRadius, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    g.lineWidth = 2;
    g.fillStyle = 'rgba(255,120,110,.8)';
    g.fillText(sim.radio ? 'radio · señal' : 'radio', c - radioRadius + 10, c - 8);
    const front = sim.pulseFront / RADIO_RANGE;
    g.strokeStyle = `rgba(92,214,255,${0.85 * (1 - front)})`;
    g.lineWidth = 4;
    g.beginPath(); g.arc(c, c, front * radioRadius, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2;
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


  const spectrum = $('spectrum');
  const spectrumContext = spectrum.getContext('2d');
  let noteText = '';

  // Histograma de la banda de 2.4 GHz: ruido, Wi-Fi en gris y los saltos del enlace del dron en rojo.
  const drawSpectrum = (distance) => {
    const g = spectrumContext;
    const w = spectrum.width;
    const h = spectrum.height;
    const left = 52;
    const bottom = 34;
    const plotW = w - left - 12;
    const plotH = h - bottom - 14;
    const toY = (dbm) => 14 + plotH * (1 - (clamp(dbm, DBM_MIN, DBM_MAX) - DBM_MIN) / (DBM_MAX - DBM_MIN));
    if (sim.clock - sim.hopTime > HOP_SECONDS) {
      sim.hopTime = sim.clock;
      sim.hops = Array.from({ length: HOPS }, () => Math.floor(Math.random() * (BAND_BINS - 2)));
    }
    const levels = Array.from({ length: BAND_BINS }, (_, bin) => {
      const mhz = BAND_START_MHZ + bin;
      let level = -96 + Math.random() * 4;
      WIFI_CHANNELS_MHZ.forEach((center, k) => {
        const offset = Math.abs(mhz - center);
        if (offset < 11) level = Math.max(level, -73 + 5 * Math.sin(sim.clock * (1.3 + k) + k) - (offset / 10) ** 2 * 10 + Math.random() * 2);
      });
      return level;
    });
    const droneBins = new Set();
    if (sim.inRange) {
      const droneLevel = -42 - 28 * Math.min(1, distance / RADIO_RANGE);
      sim.hops.forEach((bin) => [bin, bin + 1].forEach((b) => { droneBins.add(b); levels[b] = Math.max(levels[b], droneLevel + Math.random() * 3); }));
    }
    g.fillStyle = '#0e1011';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.08)';
    g.lineWidth = 1;
    g.font = '400 16px "DM Mono", monospace';
    g.fillStyle = 'rgba(255,255,255,.45)';
    g.textAlign = 'right';
    for (let dbm = DBM_MIN; dbm <= DBM_MAX; dbm += 20) {
      g.beginPath(); g.moveTo(left, toY(dbm)); g.lineTo(w - 12, toY(dbm)); g.stroke();
      g.fillText(`${dbm}`, left - 8, toY(dbm) + 5);
    }
    g.textAlign = 'center';
    for (let mhz = BAND_START_MHZ; mhz <= BAND_START_MHZ + 80; mhz += 20) {
      g.fillText(`${mhz}`, left + ((mhz - BAND_START_MHZ) / BAND_BINS) * plotW, h - 10);
    }
    const barW = plotW / BAND_BINS;
    levels.forEach((level, bin) => {
      const isDrone = droneBins.has(bin);
      g.fillStyle = isDrone ? (sim.radio ? '#ff453a' : '#e9edf0') : 'rgba(154,163,173,.55)';
      const y = toY(level);
      g.fillRect(left + bin * barW + 1, y, barW - 2, toY(DBM_MIN) - y);
    });
    g.setLineDash([8, 6]);
    g.strokeStyle = 'rgba(245,165,36,.8)';
    g.beginPath(); g.moveTo(left, toY(DETECT_DBM)); g.lineTo(w - 12, toY(DETECT_DBM)); g.stroke();
    g.setLineDash([]);
    g.textAlign = 'left';
    g.fillStyle = 'rgba(245,165,36,.9)';
    g.fillText('umbral', left + 6, toY(DETECT_DBM) - 6);
    if (sim.radio) {
      g.fillStyle = '#ff6b61';
      g.textAlign = 'right';
      g.fillText('Enlace del dron (saltos de frecuencia)', w - 16, 30);
    }
    const note = sim.radio ? 'Enlace del dron detectado (en rojo). La radio no indica la dirección: la cámara lo busca.'
      : sim.inRange ? 'Señal en rango: el barrido la identificará en un instante.'
      : 'Barrido de escucha: busca el enlace de control del dron hasta 150 m.';
    if (note !== noteText) {
      noteText = note;
      $('specNote').textContent = note;
    }
  };

  const followCamera = (world, dt) => {
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
    sim.spectrumTick += 1;
    if (sim.spectrumTick % 2 === 0) drawSpectrum(distance);
  });
}
