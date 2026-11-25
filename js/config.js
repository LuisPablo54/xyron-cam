// Pega aquí el enlace "Enviar" de tu Google Form (https://forms.gle/...). Vacío = botón en preparación.
export const CONTACT_FORM_URL = '';

export const MODEL_URL = new URL('../models/scout_v4.glb', import.meta.url).href;
export const PAN_LIMIT_DEG = 90;
export const TILT_MIN_DEG = -10;
export const TILT_MAX_DEG = 90;
export const LENS_HFOV_DEG = 22;

export const COLORS = [
  { name: 'Blanco ártico', swatch: '#f3f4f5', shell: null, trim: null },
  { name: 'Arena', swatch: '#d8ccb9', shell: '#d6cab6', trim: '#5d544a' },
  { name: 'Azul cielo', swatch: '#8cc4ec', shell: '#7fbbe8', trim: '#2c3a47' },
];
