import { COLORS } from './config.js';

// Visor del estudio: modelo 3D interactivo. three.js se descarga solo cuando la sección se acerca.
export function init() {
  const $ = (id) => document.getElementById(id);
  const container = $('sv');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let color = 0;
  let viewer = null;

  $('sw').innerHTML = COLORS
    .map((c, i) => `<button type="button" data-i="${i}" aria-label="${c.name}" title="${c.name}" aria-pressed="${i === 0}" style="background:${c.swatch}"></button>`).join('');
  $('sw').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    color = Number(button.dataset.i);
    document.querySelectorAll('#sw button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    $('cname').textContent = COLORS[color].name;
    viewer?.paint(color);
  });

  $('btnFull').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else container.requestFullscreen?.().catch(() => {});
  });
  if (!container.requestFullscreen) $('btnFull').hidden = true;

  $('sld').hidden = false;
  import('./studio-3d.js').then((module) => {
    viewer = module.start(container, color);
    $('btnSpin').setAttribute('aria-pressed', String(viewer.setSpin(!reduce)));
    $('btnSpin').addEventListener('click', () => {
      $('btnSpin').setAttribute('aria-pressed', String(viewer.setSpin($('btnSpin').getAttribute('aria-pressed') !== 'true')));
    });
    $('btnReset').addEventListener('click', () => viewer.reset());
  }).catch((error) => {
    console.error(error);
    $('sld').textContent = 'No se pudo cargar el modelo 3D.';
  });
}
