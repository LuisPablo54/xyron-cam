import { CONTACT_FORM_URL } from './config.js';

const SPECS = [
  ['Dimensiones', [['Medidas totales', '210 × 254 × 245 mm'], ['Cabeza', '144 × 143 × 146 mm'], ['Montaje', 'Brida a pretil o losa, 8 tornillos']]],
  ['Movimiento', [['Giro (pan)', '±90° (mecánica preparada para ±135°)'], ['Inclinación (tilt)', 'De −10° a +90°'], ['Modo', 'Patrullaje y seguimiento automático']]],
  ['Detección', [['Radio', 'Actividad en 2.4 GHz'], ['Visión', 'Detector de drones con IA (YOLO)'], ['Clases', 'Distingue drones de aves']]],
  ['Cámara y procesamiento', [['Sensor', '12.3 MP'], ['Lente', 'Telefoto de 16 mm'], ['Procesamiento', 'Local, con acelerador de IA']]],
  ['Materiales', [['Cabeza y tapas', 'ASA / PC-ASA con estabilizador UV'], ['Ventana', 'Policarbonato con filtro UV y capa antirrayas']]],
  ['Sellado y conexiones', [['Juntas', 'Junta perimetral fuera de la línea de tornillos'], ['Ventilación', 'Válvula ePTFE M12 y sílica gel'], ['Cables', 'Prensacables IP68 PG7 y PG9']]],
];

const FAQ = [
  ['¿XYRON CAM derriba o bloquea drones?', 'No. Scout detecta, sigue y registra. No emite interferencia ni actúa sobre el dron; tu protección es la alerta y la evidencia.'],
  ['¿Me va a alertar por el dron de juguete del vecino?', 'Está diseñada para reducir falsas alarmas: confirma con la cámara antes de avisar y distingue drones de aves. Podrás ajustar qué eventos te notifican.'],
  ['¿Necesito internet?', 'El análisis de video ocurre dentro del equipo. La conexión se usa para mandarte alertas y respaldar la evidencia.'],
  ['¿Funciona de noche?', 'La detección por radio funciona de día y de noche. La confirmación visual nocturna está en evaluación para la versión comercial.'],
  ['¿Dónde se instala?', 'En el pretil o la losa de la azotea, con vista despejada al cielo y una toma de corriente cercana.'],
  ['¿Cuándo sale a la venta?', 'Scout es un prototipo en desarrollo. Escríbenos desde el formulario de contacto para enterarte de las pruebas piloto.'],
];

const LAZY_MODULES = [
  ['#simulador', () => import('./simulator.js')],
  ['#diseno', () => import('./studio.js')],
  ['#app', () => import('./app-demo.js')],
  ['#cobertura', () => import('./coverage.js')],
];

function renderAccordions() {
  const row = ([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  document.getElementById('specacc').innerHTML = SPECS
    .map(([title, rows]) => `<section><h3>${title}</h3><dl>${rows.map(row).join('')}</dl></section>`)
    .join('');
  document.getElementById('faqacc').innerHTML = FAQ
    .map(([question, answer]) => `<details><summary>${question}</summary><p>${answer}</p></details>`)
    .join('');
}

function setupTabs() {
  const tabs = [...document.querySelectorAll('#tabs a')];
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    tabs.forEach((tab) => tab.classList.toggle('on', tab.getAttribute('href') === `#${entry.target.id}`));
  }), { rootMargin: '-45% 0px -50% 0px' });
  tabs.forEach((tab) => {
    const section = document.querySelector(tab.getAttribute('href'));
    if (section) observer.observe(section);
  });
}

function setupContact() {
  const note = document.getElementById('contactNote');
  document.querySelectorAll('[data-contact]').forEach((link) => {
    if (!CONTACT_FORM_URL) return;
    link.href = CONTACT_FORM_URL;
    link.target = '_blank';
    link.rel = 'noopener';
  });
  if (CONTACT_FORM_URL) {
    note.textContent = 'Se abre en Google Forms, en una pestaña nueva.';
  } else {
    note.textContent = 'El formulario estará disponible muy pronto.';
    document.getElementById('contactBtn').setAttribute('aria-disabled', 'true');
  }
}

// El video arranca sin sonido (los navegadores no permiten otra cosa) y se pausa fuera de pantalla.
// Con "menos movimiento" no se reproduce solo: queda con los controles del navegador.
function setupHeroVideo() {
  const video = document.getElementById('heroVideo');
  const sound = document.getElementById('heroSound');
  sound.addEventListener('click', () => {
    video.muted = !video.muted;
    if (!video.muted) video.play().catch(() => {});
    sound.setAttribute('aria-pressed', String(!video.muted));
    sound.querySelector('span').textContent = video.muted ? 'Activar sonido' : 'Silenciar';
    sound.querySelector('use').setAttribute('href', video.muted ? '#i-muted' : '#i-sound');
  });
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    video.removeAttribute('autoplay');
    video.pause();
    video.controls = true;
    sound.hidden = true;
    return;
  }
  new IntersectionObserver((entries) => {
    if (entries[entries.length - 1].isIntersecting) video.play().catch(() => {});
    else video.pause();
  }, { threshold: 0.25 }).observe(video);
}

function setupVideos() {
  const videos = [...document.querySelectorAll('.vid video')];
  videos.forEach((video) => video.addEventListener('play', () => {
    videos.forEach((other) => { if (other !== video) other.pause(); });
  }));
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) entry.target.pause();
  }));
  videos.forEach((video) => observer.observe(video));
}

// Cargo cada módulo pesado solo cuando su sección se acerca a la pantalla.
function setupLazyModules() {
  LAZY_MODULES.forEach(([selector, load]) => {
    const section = document.querySelector(selector);
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      load().then((module) => module.init(section)).catch((error) => console.error(selector, error));
    }, { rootMargin: '600px 0px' });
    observer.observe(section);
  });
}

renderAccordions();
setupTabs();
setupContact();
setupHeroVideo();
setupVideos();
setupLazyModules();
