// Общие примитивы код-эффектов Cadence. Всё — чистые функции времени:
// кадр в секунду t считается заново, без состояния между кадрами, поэтому
// рендер HyperFrames может запрашивать кадры в любом порядке.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a));
export const remap = (x, a, b, c, d) => lerp(c, d, invLerp(a, b, x));
export const smoothstep = (a, b, x) => {
  const k = invLerp(a, b, x);
  return k * k * (3 - 2 * k);
};

// Одно семейство кривых (правило velocity-sting): прилёт и уход — зеркала.
export const expoOut = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(p)));
export const expoIn = (p) => (p <= 0 ? 0 : Math.pow(2, 10 * (clamp(p) - 1)));
export const expoInOut = (p) => {
  p = clamp(p);
  return p < 0.5 ? expoIn(p * 2) / 2 : 0.5 + expoOut(p * 2 - 1) / 2;
};

// cubic-bezier(0.16, 1, 0.3, 1) — «премиальная» кривая из промптов галереи.
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (p) => {
    p = clamp(p);
    let t = p;
    for (let i = 0; i < 8; i++) {
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= (sx(t) - p) / d;
    }
    return sy(clamp(t));
  };
}
export const premium = bezier(0.16, 1, 0.3, 1);

// Пружина в замкнутой форме: отклик 0→1 на ступеньку в момент 0.
// zeta 1 — без перелёта, 0.7–0.9 — лёгкий перелёт. omega — жёсткость (рад/с).
export function spring(t, omega = 14, zeta = 0.9) {
  if (t <= 0) return 0;
  if (zeta >= 1) return 1 - (1 + omega * t) * Math.exp(-omega * t);
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t));
}

// Значение с несколькими целями = сумма пружин, по одной на смену цели.
// steps: [[время, новое значение], ...] по возрастанию; from — стартовое значение.
export function springTrack(t, from, steps, omega = 14, zeta = 0.9) {
  let v = from, prev = from;
  for (const [at, to] of steps) {
    v += (to - prev) * spring(t - at, omega, zeta);
    prev = to;
  }
  return v;
}

// Детерминированный генератор: одинаковый seed — одинаковая сцена в превью и рендере.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Сетка долей: bpm и время первой сильной доли из анализа трека.
export const beatTime = (n, bpm = 120, offset = 0) => offset + (n * 60) / bpm;

// Размер композиции берётся с корня: смена формата — только data-width/data-height.
export function stage() {
  const root = document.querySelector('[data-composition-id]');
  return {
    root,
    width: Number(root.dataset.width),
    height: Number(root.dataset.height),
    duration: Number(root.dataset.duration),
  };
}

// Цвета из CSS-переменных корня (их переписывает StylePack).
export function token(name, fallback = '#ffffff') {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// Подписка на время HyperFrames: рендер и превью шлют hf-seek, первый кадр — сразу.
export function bindSeek(render) {
  const draw = (t) => render(Math.max(0, Number(t) || 0));
  window.addEventListener('hf-seek', (e) => draw(e.detail.time));
  draw(window.__hfThreeTime || 0);
}
