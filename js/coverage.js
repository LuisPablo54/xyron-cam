import { PAN_LIMIT_DEG, LENS_HFOV_DEG } from './config.js';

const SECTOR_HALF_RAD = ((PAN_LIMIT_DEG + LENS_HFOV_DEG / 2) * Math.PI) / 180;
const SAMPLE_GRID = 40;
const CANDIDATE_GRID = 15;
const ORIENTATIONS = 8;
const TARGET_COVERAGE = 0.995;
const MAX_UNITS = 80;

function buildSamples(width, length) {
  const samples = [];
  for (let i = 0; i < SAMPLE_GRID; i += 1) {
    for (let j = 0; j < SAMPLE_GRID; j += 1) {
      samples.push([((i + 0.5) / SAMPLE_GRID) * width, ((j + 0.5) / SAMPLE_GRID) * length]);
    }
  }
  return samples;
}

function buildCandidates(width, length) {
  const candidates = [];
  for (let i = 0; i <= CANDIDATE_GRID; i += 1) {
    for (let j = 0; j <= CANDIDATE_GRID; j += 1) {
      for (let k = 0; k < ORIENTATIONS; k += 1) {
        candidates.push({ x: (i / CANDIDATE_GRID) * width, y: (j / CANDIDATE_GRID) * length, angle: (k / ORIENTATIONS) * Math.PI * 2 });
      }
    }
  }
  return candidates;
}

function covers(candidate, [sx, sy], radius) {
  const dx = sx - candidate.x;
  const dy = sy - candidate.y;
  const distance = Math.hypot(dx, dy);
  if (distance > radius) return false;
  if (distance < 1e-6) return true;
  let diff = Math.atan2(dy, dx) - candidate.angle;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return Math.abs(diff) <= SECTOR_HALF_RAD;
}

// Elijo, una por una, la posición y orientación que cubre más puntos todavía sin cubrir.
export function planCoverage(width, length, radius) {
  const samples = buildSamples(width, length);
  if (radius <= 0) return { units: [], covered: 0, samples, mask: new Uint8Array(samples.length) };
  const candidates = buildCandidates(width, length);
  const hits = candidates.map((candidate) => Uint8Array.from(samples, (sample) => (covers(candidate, sample, radius) ? 1 : 0)));
  const mask = new Uint8Array(samples.length);
  const units = [];
  let coveredCount = 0;
  while (coveredCount / samples.length < TARGET_COVERAGE && units.length < MAX_UNITS) {
    let best = -1;
    let bestGain = 0;
    hits.forEach((row, index) => {
      let gain = 0;
      for (let s = 0; s < row.length; s += 1) if (row[s] && !mask[s]) gain += 1;
      if (gain > bestGain) { bestGain = gain; best = index; }
    });
    if (best < 0) break;
    hits[best].forEach((hit, s) => { if (hit && !mask[s]) { mask[s] = 1; coveredCount += 1; } });
    units.push(candidates[best]);
  }
  return { units, covered: coveredCount / samples.length, samples, mask };
}

function draw(canvas, width, length, radius, plan) {
  const g = canvas.getContext('2d');
  const pad = 70;
  const scale = Math.min((canvas.width - pad * 2) / width, (canvas.height - pad * 2) / length);
  const ox = (canvas.width - width * scale) / 2;
  const oy = (canvas.height - length * scale) / 2;
  const px = (x) => ox + x * scale;
  const py = (y) => oy + (length - y) * scale;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#eef3f5';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#ffffff';
  g.fillRect(px(0), py(length), width * scale, length * scale);
  g.save();
  g.beginPath();
  g.rect(0, 0, canvas.width, canvas.height);
  g.clip();
  plan.units.forEach((unit) => {
    g.fillStyle = 'rgba(25,184,236,.14)';
    g.strokeStyle = 'rgba(25,184,236,.55)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(px(unit.x), py(unit.y));
    g.arc(px(unit.x), py(unit.y), radius * scale, -unit.angle - SECTOR_HALF_RAD, -unit.angle + SECTOR_HALF_RAD);
    g.closePath();
    g.fill();
    g.stroke();
  });
  g.restore();
  g.fillStyle = 'rgba(196,35,26,.75)';
  plan.samples.forEach(([x, y], i) => {
    if (plan.mask[i]) return;
    g.beginPath(); g.arc(px(x), py(y), 3, 0, Math.PI * 2); g.fill();
  });
  g.strokeStyle = '#1d2126';
  g.lineWidth = 3;
  g.strokeRect(px(0), py(length), width * scale, length * scale);
  plan.units.forEach((unit) => {
    const x = px(unit.x);
    const y = py(unit.y);
    g.fillStyle = '#1d2126';
    g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#5cd6ff';
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(-unit.angle) * 24, y + Math.sin(-unit.angle) * 24); g.stroke();
  });
  g.fillStyle = '#5b636d';
  g.font = '600 24px Inter, sans-serif';
  g.fillText(`${width} m`, px(width / 2) - 30, py(0) + 40);
  g.save();
  g.translate(px(0) - 22, py(length / 2) + 30);
  g.rotate(-Math.PI / 2);
  g.fillText(`${length} m`, 0, 0);
  g.restore();
}

export function init() {
  const $ = (id) => document.getElementById(id);
  const canvas = $('covmap');
  const inputs = { width: $('cW'), length: $('cL'), height: $('cH'), range: $('cR') };
  let pending = false;

  const update = () => {
    pending = false;
    const width = Number(inputs.width.value);
    const length = Number(inputs.length.value);
    const height = Number(inputs.height.value);
    const range = Number(inputs.range.value);
    $('cWv').textContent = `${width} m`;
    $('cLv').textContent = `${length} m`;
    $('cHv').textContent = `${height} m`;
    $('cRv').textContent = `${range} m`;
    const radius = range > height ? Math.sqrt(range * range - height * height) : 0;
    const plan = planCoverage(width, length, radius);
    draw(canvas, width, length, radius, plan);
    $('oN').textContent = radius > 0 ? String(plan.units.length) : '—';
    $('oCov').textContent = `${Math.round(plan.covered * 100)} %`;
    $('oR').textContent = radius > 0 ? `${Math.round(radius)} m` : 'Fuera';
    const frame = 2 * range * Math.tan(((LENS_HFOV_DEG / 2) * Math.PI) / 180);
    $('optics').textContent = radius > 0
      ? `Cálculo óptico: con el telefoto de 16 mm el campo de visión horizontal es de ≈${LENS_HFOV_DEG}°. A ${range} m, la imagen abarca ≈${Math.round(frame)} m de ancho.`
      : `A ${height} m de altura el dron queda fuera del alcance supuesto de ${range} m. Sube el alcance o baja la altura.`;
  };
  const schedule = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(update);
  };

  Object.values(inputs).forEach((input) => input.addEventListener('input', () => {
    document.querySelectorAll('#covPre button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    schedule();
  }));
  $('covPre').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    document.querySelectorAll('#covPre button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    inputs.width.value = button.dataset.w;
    inputs.length.value = button.dataset.l;
    schedule();
  });
  update();
}
