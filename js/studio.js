import { COLORS } from './config.js';

const FRAMES = 48;
const AUTO_SPIN_MS = 90;
const TURN_WIDTH_FACTOR = 1.1;
const frameUrl = (finish, index) => `img/360/${finish}_${String(index + 1).padStart(2, '0')}.webp`;

const PHOTO_CAPTION = {
  title: 'Diseño limpio para cualquier fachada',
  text: 'Cuerpo blanco y aro oscuro, pensada para verse bien en una azotea, no para esconderse.',
  note: 'Render fotorrealista de la Scout v4 con sus materiales. Blanco ártico es el color de producción porque refleja más sol y ayuda a mantener fresco el interior; Arena es un color de concepto.',
  hint: 'Arrastra para girar 360°',
};
const INTERACTIVE_CAPTION = {
  note: 'Render en tiempo real con materiales aproximados. Arena es un color de concepto.',
  hint: 'Arrastra para girar · rueda o pellizco para acercar',
};

// Visor del estudio: foto 360° renderizada (por defecto) y 3D interactivo que se carga solo si se pide.
export function init() {
  const $ = (id) => document.getElementById(id);
  const container = $('sv');
  const image = $('spinImg');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sets = new Map();
  const state = { mode: 'photo', frame: 0, color: 0, autoSpin: false, timer: 0, interactive: null, loading3d: null };

  const finish = () => COLORS[state.color].finish;

  const loadSet = (name) => {
    if (sets.has(name)) return sets.get(name);
    const frames = Array.from({ length: FRAMES }, (_, index) => {
      const frame = new Image();
      frame.decoding = 'async';
      frame.addEventListener('load', () => {
        if (name === finish() && state.mode === 'photo' && !image.src) showFrame(state.frame);
      });
      frame.src = frameUrl(name, index);
      return frame;
    });
    sets.set(name, frames);
    return frames;
  };

  const showFrame = (index) => {
    state.frame = ((index % FRAMES) + FRAMES) % FRAMES;
    const frames = loadSet(finish());
    let pick = state.frame;
    for (let step = 0; step < FRAMES && !frames[pick].complete; step += 1) pick = (pick + 1) % FRAMES;
    const ready = frames[pick].complete;
    if (ready) image.src = frames[pick].src;
    else image.removeAttribute('src');
    if (state.mode === 'photo') {
      $('sld').hidden = ready;
      $('sld').textContent = 'Cargando vista 360°…';
    }
  };

  const setAutoSpin = (on) => {
    state.autoSpin = on;
    $('btnSpin').setAttribute('aria-pressed', String(on));
    clearInterval(state.timer);
    if (on && state.mode === 'photo') state.timer = setInterval(() => showFrame(state.frame + 1), AUTO_SPIN_MS);
  };

  let drag = null;
  const spin = $('spin');
  spin.addEventListener('pointerdown', (event) => {
    drag = { x: event.clientX, frame: state.frame };
    spin.setPointerCapture(event.pointerId);
    setAutoSpin(false);
  });
  spin.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const pixelsPerFrame = (container.clientWidth * TURN_WIDTH_FACTOR) / FRAMES;
    showFrame(drag.frame - Math.round((event.clientX - drag.x) / pixelsPerFrame));
  });
  const endDrag = () => { drag = null; };
  spin.addEventListener('pointerup', endDrag);
  spin.addEventListener('pointercancel', endDrag);

  $('sw').innerHTML = COLORS
    .map((color, i) => `<button type="button" data-i="${i}" aria-label="${color.name}" aria-pressed="${i === 0}" style="background:${color.swatch}"></button>`).join('');
  $('sw').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    state.color = Number(button.dataset.i);
    document.querySelectorAll('#sw button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    $('cname').textContent = COLORS[state.color].name;
    if (state.mode === 'photo') showFrame(state.frame);
    state.interactive?.paint(state.color);
  });

  const setMode = (mode) => {
    state.mode = mode;
    container.dataset.mode = mode;
    $('modePhoto').setAttribute('aria-pressed', String(mode === 'photo'));
    $('mode3d').setAttribute('aria-pressed', String(mode === '3d'));
    $('views').hidden = mode !== '3d';
    $('exCtl').hidden = mode !== '3d';
    const caption = mode === 'photo' ? PHOTO_CAPTION : INTERACTIVE_CAPTION;
    $('svNote').textContent = caption.note;
    $('svHint').textContent = caption.hint;
    if (mode === 'photo') {
      $('ct').textContent = PHOTO_CAPTION.title;
      $('cd').textContent = PHOTO_CAPTION.text;
      state.interactive?.setActive(false);
      showFrame(state.frame);
      setAutoSpin(state.autoSpin);
      return;
    }
    clearInterval(state.timer);
    if (state.interactive) {
      state.interactive.setActive(true);
      return;
    }
    $('sld').hidden = false;
    $('sld').textContent = 'Cargando modelo 3D…';
    state.loading3d ??= import('./studio-3d.js').then((module) => {
      state.interactive = module.start(container, state.color);
      state.interactive.setActive(state.mode === '3d');
    }).catch((error) => {
      console.error(error);
      $('sld').textContent = 'No se pudo cargar el 3D.';
    });
  };

  $('modePhoto').addEventListener('click', () => setMode('photo'));
  $('mode3d').addEventListener('click', () => setMode('3d'));
  $('btnSpin').addEventListener('click', () => {
    if (state.mode === 'photo') setAutoSpin(!state.autoSpin);
    else $('btnSpin').setAttribute('aria-pressed', String(state.interactive?.toggleSpin() ?? false));
  });
  $('btnReset').addEventListener('click', () => {
    if (state.mode === 'photo') showFrame(0);
    else state.interactive?.reset();
  });
  $('btnFull').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else container.requestFullscreen?.().catch(() => {});
  });
  if (!container.requestFullscreen) $('btnFull').hidden = true;

  new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) clearInterval(state.timer);
    else if (state.autoSpin) setAutoSpin(true);
  }).observe(container);

  setMode('photo');
  setAutoSpin(!reduce);
}
