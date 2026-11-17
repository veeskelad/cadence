// Кадры моушн-дизайна, нарисованные кодом на canvas 2D. Каждый генератор — чистая функция:
// shotX(g, x, y, w, h, p, beat) рисует кадр в прямоугольнике; p — доли от начала кадра,
// beat — доля ролика (для пульса на удар). Палитра — PAL (тёплая тёмная тема Cadence); тон
// меняется на время отрисовки: withTone(TONES[k], () => shotX(...)).
// Перед использованием: configure({bpm, kick, perBeat, title, tools, toolsTitle}).

import {clamp, expoOut, rng} from './motion.js';

export const PAL = {coral: '#d97757', hot: '#ff8a4c', amber: '#f2a65a', cream: '#f0eee6', ash: '#a39d94', ink: '#0e0c0b', panel: '#1c1917', line: '#3a332e'};
export const SERIF = '"Literata Variable"', MONO = '"JetBrains Mono"';
// восемь тонов одной тёплой гаммы: светлые, средние, тёмные — соседние плитки разного тона
export const TONES = [
  {},
  {ink: '#f0eee6', panel: '#e8dccb', coral: '#d97757', cream: '#2a1a12', ash: '#7a6a5e', line: '#cdbba6', amber: '#b5532f'},
  {ink: '#d97757', panel: '#c96a4b', coral: '#2a120b', cream: '#fff1e4', amber: '#ffd2a6', ash: '#5a2a1a', line: '#b85c3e'},
  {ink: '#f2a65a', panel: '#e8964a', coral: '#3a1a0e', cream: '#2a120b', amber: '#7a3416', ash: '#6a3a1a', line: '#d98a40'},
  {ink: '#3a1d14', panel: '#4a2619', coral: '#ff8a4c', cream: '#ffe3c8', amber: '#f2a65a', ash: '#b08070', line: '#5c3020'},
  {ink: '#7a2e1d', panel: '#8a3a26', coral: '#f2a65a', cream: '#ffe9d0', amber: '#ffc48a', ash: '#d8a088', line: '#9a4a32'},
  {ink: '#f6d3b3', panel: '#efc4a0', coral: '#b5532f', cream: '#3a1d14', amber: '#d97757', ash: '#8a5a42', line: '#e0b08a'},
  {ink: '#1a0f0b', panel: '#24150f', coral: '#ffb27a', cream: '#f0eee6', amber: '#ff8a4c', ash: '#a38070', line: '#3a2418'},
];
export function withTone(tone, fn) {
  const saved = {...PAL};
  Object.assign(PAL, tone);
  try { return fn(); } finally { Object.assign(PAL, saved); }
}

const CFG = {bpm: 120, kick: [], perBeat: 16, title: 'трек', tools: ['HyperFrames', 'three.js', 'ffmpeg', 'твой агент'], toolsTitle: 'всё в одном месте'};
export function configure(cfg) { Object.assign(CFG, cfg); }

export const eo = (x) => expoOut(clamp(x));
export const kickAt = (beat) => CFG.kick.length ? CFG.kick[clamp(Math.floor(beat * CFG.perBeat), 0, CFG.kick.length - 1)] : 0;
export const pulse = (beat) => Math.exp(-(((beat % 1) + 1) % 1) * 6);
export const roundRect = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
const tagText = (g, n, name, col, x, y) => { g.font = `600 26px ${MONO}`; g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.fillStyle = col; g.fillText(`${String(n).padStart(2, '0')} — ${name}`, x + 40, y + 64); };
const fitFont = (g, font, size, text, maxW) => { g.font = `${font.replace('$', size)}`; const k = Math.min(1, maxW / g.measureText(text).width); g.font = `${font.replace('$', Math.floor(size * k))}`; return size * k; };
const GLYPHS = 'abcdef0123456789#%&*+=/<>';
export const glyph = (i, j, f) => GLYPHS[Math.floor((((Math.sin(i * 12.9898 + j * 78.233 + f * 37.719) * 43758.5453) % 1) + 1) % 1 * GLYPHS.length)];

export function shotIntro(g, x, y, w, h, p, beat) {
  g.fillStyle = PAL.ink; g.fillRect(x, y, w, h);
  g.fillStyle = PAL.coral; g.beginPath(); g.arc(x + w / 2, y + h / 2 - 40, 26 * (1 + 0.6 * pulse(beat)), 0, 7); g.fill();
  g.font = `500 34px ${MONO}`; g.textAlign = 'center'; g.fillStyle = PAL.ash; g.fillText(`${CFG.title} · ${Math.round(CFG.bpm)} BPM`, x + w / 2, y + h / 2 + 60); g.textAlign = 'left';
}
export function shotType(g, x, y, w, h, p) {
  g.fillStyle = PAL.coral; g.fillRect(x, y, w, h);
  const word = 'РИТМ'; const size = fitFont(g, `400 $px ${SERIF}`, h * 0.5, word, w * 0.86);
  g.textBaseline = 'alphabetic'; g.fillStyle = PAL.ink;
  let cx = x + (w - g.measureText(word).width) / 2;
  [...word].forEach((ch, i) => {
    const e = eo((p - i * 0.06) * 3.2);
    g.save(); g.translate(cx, y + h * 0.66 + (1 - e) * h * 0.55); g.rotate((1 - e) * 0.25); g.fillText(ch, 0, 0); g.restore();
    cx += g.measureText(ch).width;
  });
  g.fillRect(x + 40, y + h * 0.74, (w - 80) * eo(p * 2.5), 6);
  tagText(g, 1, 'типографика', PAL.ink, x, y);
}
export function shotRings(g, x, y, w, h, p, beat) {
  g.fillStyle = PAL.ink; g.fillRect(x, y, w, h);
  const cx = x + w / 2, cy = y + h / 2, R0 = Math.hypot(w, h) * 0.55;
  for (let i = 0; i < 14; i++) {
    const f = ((i / 14) + p * 0.8) % 1, r = f * R0;
    g.strokeStyle = i % 3 ? PAL.coral : PAL.cream; g.globalAlpha = (1 - f) * 0.95; g.lineWidth = 2 + 22 * (1 - f);
    g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
  }
  g.globalAlpha = 1; g.fillStyle = PAL.coral; g.beginPath(); g.arc(cx, cy, Math.min(w, h) * 0.08 * (1 + 0.5 * pulse(beat)), 0, 7); g.fill();
  tagText(g, 2, 'кольца', PAL.ash, x, y);
}
export function shotGrid(g, x, y, w, h, p) {
  g.fillStyle = PAL.ink; g.fillRect(x, y, w, h);
  const n = 6, cell = Math.min(w, h) / (n + 0.6), ox = x + (w - cell * n) / 2, oy = y + (h - cell * n) / 2;
  for (let c = 0; c < n; c++) for (let r = 0; r < n; r++) {
    const e = eo(p * 3.2 - (c + r) * 0.11), s = cell * 0.8 * e;
    g.save(); g.translate(ox + (c + 0.5) * cell, oy + (r + 0.5) * cell); g.rotate((1 - e) * Math.PI / 2);
    g.fillStyle = (c * 7 + r * 3) % 5 === 0 ? PAL.cream : (c + r) % 2 ? PAL.coral : PAL.line;
    roundRect(g, -s / 2, -s / 2, s, s, s * 0.18); g.fill(); g.restore();
  }
  tagText(g, 3, 'сетка', PAL.ash, x, y);
}
export function shotCount(g, x, y, w, h, p) {
  g.fillStyle = PAL.panel; g.fillRect(x, y, w, h);
  const v = Math.round(CFG.bpm * eo(p * 1.8)), txt = String(v);
  fitFont(g, `700 $px ${MONO}`, h * 0.42, '130', w * 0.8);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = PAL.cream; g.fillText(txt, x + w / 2, y + h * 0.6);
  g.font = `600 52px ${MONO}`; g.fillStyle = PAL.coral; g.fillText('BPM', x + w / 2, y + h * 0.6 + 90); g.textAlign = 'left';
  g.fillStyle = PAL.line; g.fillRect(x + 80, y + h * 0.84, w - 160, 6);
  g.fillStyle = PAL.coral; g.fillRect(x + 80, y + h * 0.84, (w - 160) * eo(p * 1.8), 6);
  tagText(g, 4, 'счётчик', PAL.ash, x, y);
}
export function shotSlice(g, x, y, w, h, p) {
  g.fillStyle = PAL.cream; g.fillRect(x, y, w, h);
  const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.38, N = 11, bh = (2 * r) / N;
  for (let i = 0; i < N; i++) {
    const off = (i % 2 ? 1 : -1) * (1 - eo(p * 2.6 - i * 0.05)) * w * 0.8;
    g.save(); g.beginPath(); g.rect(x, cy - r + i * bh, w, bh - 3); g.clip(); g.translate(off, 0);
    g.fillStyle = i % 4 === 1 ? PAL.hot : PAL.coral; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); g.restore();
  }
  tagText(g, 5, 'срез', PAL.ink, x, y);
}
export function shotKinetic(g, x, y, w, h, p) {
  g.fillStyle = PAL.ink; g.fillRect(x, y, w, h);
  const lines = ['СМЕНА', 'КАДРА', 'НА УДАР'];
  const size = fitFont(g, `800 $px Onest`, h * 0.24, 'НА УДАР', w * 0.88);
  g.textBaseline = 'alphabetic';
  lines.forEach((t, i) => {
    const e = eo(p * 2.8 - i * 0.09), dir = i % 2 ? 1 : -1, tw = g.measureText(t).width;
    const tx = x + (w - tw) / 2 + dir * (1 - e) * w, ty = y + h / 2 + (i - 1) * size * 0.95 + size * 0.35;
    if (i === 1) { g.lineWidth = 4; g.strokeStyle = PAL.coral; g.strokeText(t, tx, ty); } else { g.fillStyle = i === 2 ? PAL.coral : PAL.cream; g.fillText(t, tx, ty); }
  });
  tagText(g, 6, 'кинетика', PAL.ash, x, y);
}
export function shotWave(g, x, y, w, h, p, beat) {
  g.fillStyle = PAL.ink; g.fillRect(x, y, w, h);
  const span = 4, mid = y + h / 2, reveal = x + w * eo(p * 3);
  const bw = w / (span * 2 * CFG.perBeat);
  for (let i = 0; i < span * 2 * CFG.perBeat; i++) {
    const bt = beat - span + i / CFG.perBeat, bx = x + i * bw; if (bx > reveal) break;
    const hh = 4 + kickAt(bt) * h * 0.4;
    g.fillStyle = bt <= beat ? PAL.coral : PAL.line; g.fillRect(bx, mid - hh, Math.max(2, bw - 2), hh * 2);
  }
  g.fillStyle = PAL.cream; g.fillRect(x + w / 2 - 2, y + 60, 4, h - 120);
  tagText(g, 7, 'волна', PAL.ash, x, y);
}
export function shotCube(g, x, y, w, h, p, beat) {
  g.fillStyle = PAL.coral; g.fillRect(x, y, w, h);
  const cx = x + w / 2, cy = y + h / 2, base = Math.min(w, h) * 0.3 * (1 + 0.06 * pulse(beat));
  const V = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
  const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  [[1, 6], [0.62, 4], [0.36, 3]].forEach(([k, lw], j) => {
    const ay = beat * 0.9 * (j % 2 ? -1 : 1) + p * 1.2, ax = 0.6 + j * 0.3;
    const P = V.map(([vx, vy, vz]) => {
      const x1 = vx * Math.cos(ay) - vz * Math.sin(ay), z1 = vx * Math.sin(ay) + vz * Math.cos(ay);
      const y2 = vy * Math.cos(ax) - z1 * Math.sin(ax), z2 = vy * Math.sin(ax) + z1 * Math.cos(ax);
      const s = base * k * eo(p * 3 - j * 0.1) / (1 + z2 * 0.18);
      return [cx + x1 * s, cy + y2 * s];
    });
    g.strokeStyle = j === 1 ? PAL.cream : PAL.ink; g.lineWidth = lw; g.beginPath();
    E.forEach(([a, c]) => { g.moveTo(P[a][0], P[a][1]); g.lineTo(P[c][0], P[c][1]); }); g.stroke();
  });
  tagText(g, 8, 'каркас', PAL.ink, x, y);
}
const warp = Array.from({length: 260}, (_, i) => { const r = rng(300 + i); return [r() * Math.PI * 2, r(), r()]; });
export function shotWarp(g, x, y, w, h, p) {
  g.fillStyle = PAL.ink; g.fillRect(x, y, w, h);
  const cx = x + w / 2, cy = y + h / 2, M = Math.hypot(w, h) * 0.6;
  g.lineCap = 'round';
  warp.forEach(([a, s, c]) => {
    const r0 = ((s + p * 0.9) % 1) * M, len = 20 + r0 * 0.5 * (0.4 + c);
    g.strokeStyle = c > 0.7 ? PAL.cream : c > 0.35 ? PAL.amber : PAL.coral; g.globalAlpha = Math.min(1, r0 / 120); g.lineWidth = 2 + c * 5;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len)); g.stroke();
  });
  g.globalAlpha = 1; g.lineCap = 'butt';
  tagText(g, 9, 'прыжок', PAL.ash, x, y);
}
export function shotTools(g, x, y, w, h, p) {
  g.fillStyle = PAL.ink; g.fillRect(x, y, w, h);
  const steps = p * 3.4, k = Math.min(CFG.tools.length - 1, Math.floor(steps)), pos = Math.min(CFG.tools.length - 1, k + eo((steps - k) * 3));
  const rowH = 150, cy = y + h / 2;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  CFG.tools.forEach((t, i) => {
    const d = i - pos, ty = cy + d * rowH; if (Math.abs(d) > 3) return;
    const focus = Math.max(0, 1 - Math.abs(d));
    g.font = `400 ${Math.round(64 + 48 * focus)}px ${SERIF}`;
    g.globalAlpha = 0.25 + 0.75 * focus; g.fillStyle = i === CFG.tools.length - 1 ? PAL.coral : PAL.cream;
    g.fillText(t, x + w / 2, ty);
  });
  g.globalAlpha = 1; g.textAlign = 'left';
  g.fillStyle = PAL.coral; g.fillRect(x + 90, cy - 70, 6, 140); g.fillRect(x + w - 96, cy - 70, 6, 140);
  g.font = `600 26px ${MONO}`; g.fillStyle = PAL.coral; g.textBaseline = 'alphabetic'; g.fillText(`10 — ${CFG.toolsTitle}`, x + 40, y + 64);
}
export function shotMosaic(g, x, y, w, h, p, beat) {
  const qs = [shotType, shotRings, shotCube, shotWarp], gw = (w - 12) / 2, gh = (h - 12) / 2;
  qs.forEach((fn, i) => {
    const qx = x + (i % 2) * (gw + 12), qy = y + Math.floor(i / 2) * (gh + 12);
    g.save(); g.beginPath(); g.rect(qx, qy, gw, gh); g.clip(); fn(g, qx, qy, gw, gh, 0.6 + p - i * 0.08, beat); g.restore();
  });
  g.fillStyle = PAL.ink; g.fillRect(x, y + h / 2 - 6, w, 12); g.fillRect(x + w / 2 - 6, y, 12, h);
}
// Ещё кадры для кольца-знака: каждый нарисован кодом, ни одного кадра из исходников.
export function shotHalftone(g, x, y, w, h, p, beat, col = PAL.coral, bg = PAL.ink) {
  g.fillStyle = bg; g.fillRect(x, y, w, h);
  const n = 14, s = w / n, cx = x + w / 2, cy = y + h / 2;
  g.fillStyle = col;
  for (let c = 0; c <= n; c++) for (let r = 0; r <= Math.ceil(h / s); r++) {
    const px = x + c * s, py = y + r * s, d = Math.hypot(px - cx, py - cy) / w;
    const rad = s * 0.48 * (0.5 + 0.5 * Math.sin(d * 9 - p * 5 + pulse(beat) * 0.8));
    if (rad > 0.6) { g.beginPath(); g.arc(px, py, rad, 0, 7); g.fill(); }
  }
}
export function shotContours(g, x, y, w, h, p) {
  g.fillStyle = PAL.ink; g.fillRect(x, y, w, h);
  g.lineWidth = 3;
  for (let k = 0; k < 18; k++) {
    g.strokeStyle = k % 4 ? PAL.coral : PAL.amber; g.globalAlpha = k % 4 ? 0.4 : 1;
    g.beginPath();
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2, rr = (k + 1) * w * 0.032 * (1 + 0.18 * Math.sin(a * 3 + p * 2 + k * 0.4) + 0.08 * Math.sin(a * 5 - p * 3));
      const px = x + w / 2 + Math.cos(a) * rr, py = y + h / 2 + Math.sin(a) * rr * 1.25;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.closePath(); g.stroke();
  }
  g.globalAlpha = 1;
}
export function shotSpiral(g, x, y, w, h, p, beat) {
  g.fillStyle = PAL.panel; g.fillRect(x, y, w, h);
  const n = 420, cx = x + w / 2, cy = y + h / 2, k = Math.min(w, h) * 0.022;
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + p * 0.6, r = k * Math.sqrt(i) * (0.4 + 0.6 * eo(p * 2 - i / n));
    g.fillStyle = i % 9 === 0 ? PAL.cream : i % 2 ? PAL.coral : PAL.amber;
    g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2 + 5 * (i / n) * (1 + 0.4 * pulse(beat)), 0, 7); g.fill();
  }
}
export function shotEq(g, x, y, w, h, p, beat) {
  g.fillStyle = PAL.ink; g.fillRect(x, y, w, h);
  const n = 16, bw = w / n;
  for (let i = 0; i < n; i++) {
    const v = kickAt(beat - i * 0.125) * 0.8 + 0.2 * (0.5 + 0.5 * Math.sin(i * 1.7 + beat * 3)), bh = v * h * 0.7;
    g.fillStyle = i % 5 === 0 ? PAL.cream : PAL.coral;
    for (let k = 0; k < bh; k += 26) g.fillRect(x + i * bw + 4, y + h * 0.85 - k - 20, bw - 8, 20);
  }
}
export function shotGlyphC(g, x, y, w, h, p, beat) {
  g.fillStyle = PAL.coral; g.fillRect(x, y, w, h);
  g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(Math.sin(p * 1.3) * 0.25);
  g.font = `400 ${Math.round(Math.min(w, h) * (1.1 + 0.05 * pulse(beat)))}px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let k = 5; k >= 0; k--) { g.fillStyle = k ? `rgba(14,12,11,${(0.12 * (6 - k)) / 6})` : PAL.ink; g.fillText('C', k * 14 * Math.cos(p), k * 14 * Math.sin(p)); }
  g.restore(); g.textAlign = 'left';
}
export function shotOrbits(g, x, y, w, h, p, beat) {
  g.fillStyle = PAL.ink; g.fillRect(x, y, w, h);
  const cx = x + w / 2, cy = y + h / 2;
  for (let k = 1; k <= 5; k++) {
    const rx = w * 0.09 * k, ry = rx * 0.42, a = p * (1.6 / k) + k;
    g.save(); g.translate(cx, cy); g.rotate(-0.4);
    g.strokeStyle = PAL.line; g.lineWidth = 2; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, 7); g.stroke();
    g.fillStyle = k === 3 ? PAL.cream : PAL.coral; g.beginPath(); g.arc(Math.cos(a) * rx, Math.sin(a) * ry, 8 + k * 2, 0, 7); g.fill();
    g.restore();
  }
  g.fillStyle = PAL.amber; g.beginPath(); g.arc(cx, cy, w * 0.06 * (1 + 0.3 * pulse(beat)), 0, 7); g.fill();
}
export function shotStripes(g, x, y, w, h, p) {
  g.fillStyle = PAL.cream; g.fillRect(x, y, w, h);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x + w / 2, y + h / 2); g.rotate(-0.6);
  const sw = 46, L = Math.hypot(w, h), off = (p * 60) % (sw * 2);
  for (let i = -20; i < 20; i++) { g.fillStyle = i % 3 ? PAL.coral : PAL.ink; g.fillRect(i * sw * 2 + off + Math.sin(i * 0.3 + p * 2) * 40, -L / 2, sw, L); }
  g.restore();
}
export function shotDecode(g, x, y, w, h, p, beat) {
  g.fillStyle = PAL.panel; g.fillRect(x, y, w, h);
  const word = 'CADENCE', f = Math.round(beat * 12), rows = 9;
  g.font = `700 ${Math.round(w * 0.16)}px ${MONO}`; g.textBaseline = 'middle'; g.textAlign = 'left';
  const cw = g.measureText('M').width;
  for (let r = 0; r < rows; r++) {
    const shown = Math.floor(clamp(p * 1.4 - Math.abs(r - 4) * 0.1) * (word.length + 1));
    for (let j = 0; j < word.length; j++) {
      const ok = j < shown;
      g.globalAlpha = r === 4 ? 1 : 0.3; g.fillStyle = ok ? (r === 4 ? PAL.coral : PAL.cream) : PAL.ash;
      g.fillText(ok ? word[j] : glyph(r, j, f), x + (w - cw * word.length) / 2 + j * cw, y + (h * (r + 0.5)) / rows);
    }
  }
  g.globalAlpha = 1;
}
export function shotBlobs(g, x, y, w, h, p, beat) {
  g.fillStyle = PAL.ink; g.fillRect(x, y, w, h);
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.7;
  [[PAL.coral, 0.3, 0.4], [PAL.amber, 0.7, 0.55], [PAL.hot, 0.45, 0.75]].forEach(([c, u, v], i) => {
    const cx = x + w * (u + 0.18 * Math.sin(p * 1.1 + i * 2)), cy = y + h * (v + 0.12 * Math.cos(p * 0.9 + i)), r = w * (0.55 + 0.08 * pulse(beat));
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  });
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}
export function shotLissajous(g, x, y, w, h, p) {
  g.fillStyle = PAL.ink; g.fillRect(x, y, w, h);
  g.strokeStyle = PAL.amber; g.lineWidth = 4; g.beginPath();
  const N = 600, n = Math.round(N * clamp(p * 1.5));
  for (let i = 0; i <= n; i++) {
    const a = (i / N) * Math.PI * 2, px = x + w / 2 + w * 0.4 * Math.sin(3 * a + p), py = y + h / 2 + h * 0.3 * Math.sin(4 * a);
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.stroke();
}

// Все генераторы по порядку: монтаж «смена кадра на удар» и плитки знака берут их отсюда.
export const ALL = [shotType, shotHalftone, shotRings, shotContours, shotGrid, shotSpiral, shotCount, shotEq, shotSlice, shotGlyphC,
  shotKinetic, shotOrbits, shotWave, shotStripes, shotCube, shotDecode, shotWarp, shotBlobs, shotLissajous, shotTools, shotMosaic];
