const RANGE_M = 150;
const FLIGHT_HEIGHT_M = 50;

const SAMPLE_GRID = 48;
const CANDIDATE_GRID = 20;
const TARGET_COVERAGE = 0.995;
const MAX_UNITS = 200;
const GREEDY_MAX_UNITS = 30;

function buildSamples(width, length) {
  const samples = [];
  for (let i = 0; i < SAMPLE_GRID; i += 1) {
    for (let j = 0; j < SAMPLE_GRID; j += 1) {
      samples.push([((i + 0.5) / SAMPLE_GRID) * width, ((j + 0.5) / SAMPLE_GRID) * length]);
    }
  }
  return samples;
}

function measure(units, samples, radius) {
  const mask = new Uint8Array(samples.length);
  let covered = 0;
  samples.forEach(([x, y], s) => {
    if (units.some((unit) => Math.hypot(x - unit.x, y - unit.y) <= radius)) {
      mask[s] = 1;
      covered += 1;
    }
  });
  return { mask, covered: covered / samples.length };
}

// Acomodo en franjas: cada fila de equipos cubre una franja de alto h; pruebo cuántas filas conviene usar.
function stripLayout(width, length, radius) {
  let best = null;
  for (const [across, along, swap] of [[width, length, false], [length, width, true]]) {
    for (let rows = 1; rows <= MAX_UNITS; rows += 1) {
      const band = along / rows;
      if (band >= 2 * radius) continue;
      const spacing = 2 * Math.sqrt(radius * radius - (band / 2) ** 2);
      const columns = Math.ceil(across / spacing);
      if (rows * columns > MAX_UNITS) break;
      if (best && rows * columns >= best.length) continue;
      const units = [];
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < columns; c += 1) {
          const a = ((c + 0.5) / columns) * across;
          const b = ((r + 0.5) / rows) * along;
          units.push(swap ? { x: b, y: a } : { x: a, y: b });
        }
      }
      best = units;
    }
  }
  return best ?? [];
}

// Acomodo voraz: elijo, una por una, la posición que cubre más puntos todavía sin cubrir.
function greedyLayout(width, length, radius, samples) {
  const candidates = [];
  for (let i = 0; i <= CANDIDATE_GRID; i += 1) {
    for (let j = 0; j <= CANDIDATE_GRID; j += 1) {
      candidates.push({ x: (i / CANDIDATE_GRID) * width, y: (j / CANDIDATE_GRID) * length });
    }
  }
  const hits = candidates.map((unit) => Uint8Array.from(samples, ([x, y]) => (Math.hypot(x - unit.x, y - unit.y) <= radius ? 1 : 0)));
  const mask = new Uint8Array(samples.length);
  const units = [];
  let covered = 0;
  while (covered / samples.length < TARGET_COVERAGE && units.length < MAX_UNITS) {
    let best = -1;
    let bestGain = 0;
    hits.forEach((row, index) => {
      let gain = 0;
      for (let s = 0; s < row.length; s += 1) if (row[s] && !mask[s]) gain += 1;
      if (gain > bestGain) { bestGain = gain; best = index; }
    });
    if (best < 0) break;
    hits[best].forEach((hit, s) => { if (hit && !mask[s]) { mask[s] = 1; covered += 1; } });
    units.push(candidates[best]);
  }
  return units;
}

export function planCoverage(width, length, radius) {
  const samples = buildSamples(width, length);
  if (radius <= 0) return { units: [], covered: 0, samples, mask: new Uint8Array(samples.length) };
  const strips = stripLayout(width, length, radius);
  const layouts = strips.length && strips.length <= GREEDY_MAX_UNITS ? [strips, greedyLayout(width, length, radius, samples)] : [strips];
  const plans = layouts.map((units) => ({ units, ...measure(units, samples, radius) }));
  const complete = plans.filter((plan) => plan.covered >= TARGET_COVERAGE).sort((a, b) => a.units.length - b.units.length);
  const chosen = complete[0] ?? plans.sort((a, b) => b.covered - a.covered)[0];
  return { ...chosen, samples };
}

// Encuadro el terreno y los círculos completos de cada Scout.
function draw(canvas, width, length, radius, plan) {
  const g = canvas.getContext('2d');
  const xs = [0, width, ...plan.units.flatMap((u) => [u.x - radius, u.x + radius])];
  const ys = [0, length, ...plan.units.flatMap((u) => [u.y - radius, u.y + radius])];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const pad = 28;
  const scale = Math.min((canvas.width - pad * 2) / spanX, (canvas.height - pad * 2) / spanY);
  const ox = (canvas.width - spanX * scale) / 2 - minX * scale;
  const oy = (canvas.height - spanY * scale) / 2 + (minY + spanY) * scale;
  const px = (x) => ox + x * scale;
  const py = (y) => oy - y * scale;
  g.fillStyle = '#eef3f5';
  g.fillRect(0, 0, canvas.width, canvas.height);
  plan.units.forEach((unit) => {
    g.fillStyle = 'rgba(25,184,236,.13)';
    g.strokeStyle = 'rgba(25,184,236,.7)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(px(unit.x), py(unit.y), radius * scale, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  });
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#1d2126';
  g.lineWidth = 3;
  const lotW = Math.max(width * scale, 6);
  const lotH = Math.max(length * scale, 6);
  g.fillRect(px(width / 2) - lotW / 2, py(length / 2) - lotH / 2, lotW, lotH);
  g.strokeRect(px(width / 2) - lotW / 2, py(length / 2) - lotH / 2, lotW, lotH);
  plan.units.forEach((unit) => {
    g.fillStyle = '#1d2126';
    g.beginPath(); g.arc(px(unit.x), py(unit.y), 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5cd6ff';
    g.beginPath(); g.arc(px(unit.x), py(unit.y), 4, 0, Math.PI * 2); g.fill();
  });
  g.fillStyle = '#5b636d';
  g.font = '600 22px Inter, sans-serif';
  g.textAlign = 'center';
  g.fillText(`radio ${Math.round(radius)} m`, canvas.width / 2, canvas.height - 10);
}

export function init(section) {
  const radius = Math.sqrt(RANGE_M ** 2 - FLIGHT_HEIGHT_M ** 2);
  section.querySelectorAll('.covcard').forEach((card) => {
    const canvas = card.querySelector('canvas');
    const width = Number(canvas.dataset.w);
    const length = Number(canvas.dataset.l);
    const plan = planCoverage(width, length, radius);
    draw(canvas, width, length, radius, plan);
    const count = plan.units.length;
    card.querySelector('[data-out]').textContent = `${width} × ${length} m · ${count} Scout`;
  });
}
