const SCREEN_WIDTH = 390;
const SWAP_FALLBACK_MS = 4000;
const TOAST_MS = 2400;
const START_VIEW = 'inicio';

const VIEWS = [
  ['inicio', 'Inicio'],
  ['notificacion', 'Notificación'],
  ['alerta', 'Dron detectado'],
  ['detalle', 'Detalle'],
  ['reporte', 'Reportar'],
  ['falso-positivo', 'Falso positivo'],
  ['historial', 'Historial'],
  ['ajustes', 'Ajustes'],
  ['perfil', 'Perfil'],
  ['login', 'Inicio de sesión'],
];
const KNOWN = new Set(VIEWS.map(([id]) => id));

export function init() {
  const $ = (id) => document.getElementById(id);
  const frames = [...document.querySelectorAll('#dscale iframe')];
  const jump = $('jump');
  let front = 0;
  let current = null;
  let alertMode = false;
  let swapTimer = 0;
  let toastTimer = 0;

  const screen = document.querySelector('.dscreen');
  new ResizeObserver(() => {
    $('dscale').style.transform = `scale(${screen.clientWidth / SCREEN_WIDTH})`;
  }).observe(screen);

  jump.innerHTML = VIEWS.map(([id, label]) => `<button type="button" data-go="${id}">${label}</button>`).join('');
  jump.addEventListener('click', (event) => {
    const button = event.target.closest('[data-go]');
    if (button) navigate(button.dataset.go);
  });

  const swap = (id) => {
    const back = frames[1 - front];
    if (back.dataset.view !== id || back.classList.contains('on')) return;
    clearTimeout(swapTimer);
    back.classList.add('on');
    back.removeAttribute('aria-hidden');
    const old = frames[front];
    old.classList.remove('on');
    old.setAttribute('aria-hidden', 'true');
    front = 1 - front;
    $('dwait').hidden = true;
    setTimeout(() => { if (!old.classList.contains('on')) old.src = 'about:blank'; }, 350);
  };

  // Cargo la pantalla en el iframe oculto y lo muestro cuando avisa que ya se pintó.
  const load = (id) => {
    const view = KNOWN.has(id) ? id : START_VIEW;
    if (view === current) return;
    current = view;
    jump.querySelectorAll('[data-go]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.go === view)));
    const back = frames[1 - front];
    back.dataset.view = view;
    back.src = `screens/${view}.html`;
    clearTimeout(swapTimer);
    swapTimer = setTimeout(() => swap(view), SWAP_FALLBACK_MS);
  };

  const navigate = (target) => {
    let view = target;
    if (view === '@home') view = alertMode ? 'alerta' : 'inicio';
    if (view === 'alerta') alertMode = true;
    if (view === 'login' || view === 'inicio') alertMode = false;
    load(view);
  };

  const toast = (message) => {
    const element = $('dtoast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('show'), TOAST_MS);
  };

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || !data.xyron) return;
    if (data.ready) {
      if (event.source === frames[1 - front].contentWindow) swap(data.ready);
      return;
    }
    if (event.source !== frames[front].contentWindow) return;
    if (data.toast) toast(data.toast);
    if (data.to) navigate(data.to);
  });

  load(START_VIEW);
}
