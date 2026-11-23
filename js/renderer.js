import * as THREE from 'three';

const MAX_PIXEL_RATIO = 2;
const MIN_PIXEL_RATIO = 1;
const SLOW_FRAME_MS = 34;
const SAMPLE_FRAMES = 90;

export function createRenderer(container, { alpha = false, toneMapping = THREE.ACESFilmicToneMapping } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = toneMapping;
  container.prepend(renderer.domElement);
  return renderer;
}

export function watchSize(renderer, container, onResize) {
  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height, false);
    onResize(width, height);
  };
  new ResizeObserver(resize).observe(container);
  resize();
}

// Dibujo solo cuando el contenedor está a la vista y bajo la resolución si los cuadros tardan demasiado.
export function runWhenVisible(renderer, container, frame) {
  let visible = false;
  let last = 0;
  let total = 0;
  let count = 0;
  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }).observe(container);
  renderer.setAnimationLoop((now) => {
    if (!visible || document.hidden) { last = 0; return; }
    if (last) {
      total += now - last;
      count += 1;
    }
    last = now;
    if (count === SAMPLE_FRAMES) {
      const ratio = renderer.getPixelRatio();
      if (total / count > SLOW_FRAME_MS && ratio > MIN_PIXEL_RATIO) renderer.setPixelRatio(Math.max(MIN_PIXEL_RATIO, ratio - 0.25));
      total = 0;
      count = 0;
    }
    frame(now / 1000);
  });
}

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
