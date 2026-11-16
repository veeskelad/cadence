// Приёмы «мягкого техно»-постера: плывущий mesh-градиент, фокус по слоям текста, смаз движения по оси,
// липкие буквы (метаболлы), жидкая деформация шумом, полутон по маске, грань-призма со сменой материала,
// ASCII-рендер любой формы или кадра.
// Каждая функция строит слой один раз и возвращает draw(t) — кадр целиком из времени t, без состояния
// между кадрами (движок снимает кадры в любом порядке). Случайность — только rng(seed).

import {rng, clamp, lerp, smoothstep} from './motion.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};
let uid = 0;
const nextId = (p) => `${p}-${++uid}`;

// Один общий <svg><defs> на документ: в нём живут фильтры приёмов.
export function defs() {
  let host = document.getElementById('looks-defs');
  if (!host) {
    host = svgEl('svg', {id: 'looks-defs', width: 0, height: 0, style: 'position:absolute;width:0;height:0'});
    document.body.appendChild(host);
    svgEl('defs', {}, host);
  }
  return host.firstChild;
}

const hex = (c) => {
  const v = c.replace('#', '');
  const n = parseInt(v.length === 3 ? v.split('').map((x) => x + x).join('') : v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/* 1. Mesh-градиент.
   Маленький canvas (по умолчанию 160 px по длинной стороне) рисует 4–7 мягких пятен, которые плывут по
   фигурам Лиссажу; CSS растягивает его на весь кадр — так дешевле и глаже гигантского blur().
   Поверх — зерно: без него градиент в MP4 ломается на полосы. */
export function meshGradient(host, {colors, base = '#3f7fe0', blobs = 6, seed = 3, speed = 1, grain = 0.06, res = 160} = {}) {
  const r = rng(seed);
  const W = host.clientWidth || 1920, H = host.clientHeight || 1080;
  const cw = W >= H ? res : Math.round(res * W / H), ch = W >= H ? Math.round(res * H / W) : res;
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  Object.assign(cv.style, {position: 'absolute', inset: '0', width: '100%', height: '100%', filter: 'blur(18px) saturate(1.15)', transform: 'scale(1.12)'});
  host.appendChild(cv);
  const g = cv.getContext('2d');
  const pal = colors.map(hex);
  const bs = Array.from({length: blobs}, (_, i) => ({
    c: pal[i % pal.length], ax: 0.2 + r() * 0.35, ay: 0.2 + r() * 0.35, fx: 0.11 + r() * 0.17, fy: 0.09 + r() * 0.19,
    px: r() * 6.28, py: r() * 6.28, cx: 0.2 + r() * 0.6, cy: 0.2 + r() * 0.6, rad: 0.35 + r() * 0.35, a: 0.65 + r() * 0.35,
  }));
  // зерно: статичная мелкая текстура, сдвигаемая по кадрам (дёшево и без полос)
  const gr = document.createElement('canvas');
  gr.width = 512; gr.height = 512;
  const gg = gr.getContext('2d');
  const img = gg.createImageData(512, 512);
  const rg = rng(seed + 17);
  for (let i = 0; i < img.data.length; i += 4) { const v = rg() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  gg.putImageData(img, 0, 0);
  const noise = document.createElement('div');
  Object.assign(noise.style, {position: 'absolute', inset: '0', backgroundImage: `url(${gr.toDataURL()})`, opacity: String(grain), mixBlendMode: 'overlay', pointerEvents: 'none'});
  host.appendChild(noise);
  const [br, bg, bb] = hex(base);
  return (t) => {
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = `rgb(${br},${bg},${bb})`;
    g.fillRect(0, 0, cw, ch);
    const tt = t * speed;
    for (const b of bs) {
      const x = (b.cx + b.ax * Math.sin(tt * b.fx * 6.28 * 0.25 + b.px)) * cw;
      const y = (b.cy + b.ay * Math.cos(tt * b.fy * 6.28 * 0.25 + b.py)) * ch;
      const rad = b.rad * Math.max(cw, ch) * (0.85 + 0.15 * Math.sin(tt * 0.7 + b.px));
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},${b.a})`);
      grd.addColorStop(1, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0)`);
      g.fillStyle = grd;
      g.fillRect(0, 0, cw, ch);
    }
    const f = Math.floor(t * 24);
    noise.style.backgroundPosition = `${(f * 137) % 512}px ${(f * 263) % 512}px`;
  };
}

/* 2. Фокус по слоям. Слой текста уходит в расфокус и возвращается: blur растёт, буквы чуть
   расширяются и бледнеют. focus(k): k=1 резко, k=0 полностью размыто. */
export function focus(el, k, {maxBlur = 22, grow = 0.04} = {}) {
  const b = (1 - clamp(k)) * maxBlur;
  el.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : 'none';
  el.style.transform = `scale(${1 + (1 - clamp(k)) * grow})`;
}
// Сколько резкости у слоя i из n в момент t: «волна фокуса» проходит по слоям за период.
export const focusWave = (i, n, t, period = 4, width = 0.9) => {
  const ph = ((t / period) % 1) * n;
  const d = Math.min(Math.abs(ph - i), n - Math.abs(ph - i));
  return smoothstep(width, 0, d);
};

/* 3. Смаз движения по одной оси. Фильтр SVG с stdDeviation только по X (или Y): буквы тянутся
   в сторону движения, в покое смаза нет. Скорость берётся из той же функции положения.
   Цветная кайма: копия слоя со сдвигом против движения, окрашенная в fringe. */
export function motionBlur(el, {axis = 'x'} = {}) {
  const id = nextId('mb');
  const f = svgEl('filter', {id, x: '-30%', y: '-30%', width: '160%', height: '160%', 'color-interpolation-filters': 'sRGB'}, defs());
  const gb = svgEl('feGaussianBlur', {in: 'SourceGraphic', stdDeviation: '0 0'}, f);
  el.style.filter = `url(#${id})`;
  return (v) => {
    const s = Math.min(60, Math.abs(v) * 0.018);
    gb.setAttribute('stdDeviation', axis === 'x' ? `${s.toFixed(2)} 0` : `0 ${s.toFixed(2)}`);
  };
}

/* 4. Липкие буквы (метаболлы). Размытие и порог по альфе склеивают близкие формы.
   Внутрь слоя кладут текст и круги-капли; капля, проходя через буквы, раздувает их и слипает. */
export function gooey(el, {blur = 12, contrast = 22} = {}) {
  const id = nextId('goo');
  const f = svgEl('filter', {id, 'color-interpolation-filters': 'sRGB'}, defs());
  const gb = svgEl('feGaussianBlur', {in: 'SourceGraphic', stdDeviation: blur, result: 'b'}, f);
  svgEl('feColorMatrix', {in: 'b', mode: 'matrix', values: `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${contrast} ${-contrast / 2}`}, f);
  el.style.filter = `url(#${id})`;
  return (b) => gb.setAttribute('stdDeviation', b);
}

/* 5. Жидкая деформация. Шум (feTurbulence) сдвигает пиксели слоя (feDisplacementMap); фаза шума —
   функция t через baseFrequency, сила — scale. Порог после сдвига сохраняет чистый край без «грязи». */
export function liquid(el, {freq = 0.006, scale = 90, octaves = 2, seed = 4, clean = true} = {}) {
  const id = nextId('liq');
  const f = svgEl('filter', {id, x: '-20%', y: '-40%', width: '140%', height: '180%', 'color-interpolation-filters': 'sRGB'}, defs());
  const tu = svgEl('feTurbulence', {type: 'fractalNoise', baseFrequency: freq, numOctaves: octaves, seed, result: 'n'}, f);
  const dm = svgEl('feDisplacementMap', {in: 'SourceGraphic', in2: 'n', scale, xChannelSelector: 'R', yChannelSelector: 'G', result: 'd'}, f);
  if (clean) {
    svgEl('feGaussianBlur', {in: 'd', stdDeviation: 2.5, result: 'db'}, f);
    svgEl('feColorMatrix', {in: 'db', mode: 'matrix', values: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8'}, f);
  }
  el.style.filter = `url(#${id})`;
  return (t, {amount = 1, drift = 1} = {}) => {
    const fx = freq * (1 + 0.35 * Math.sin(t * 0.9 * drift)), fy = freq * (1 + 0.35 * Math.cos(t * 0.7 * drift));
    tu.setAttribute('baseFrequency', `${fx.toFixed(5)} ${fy.toFixed(5)}`);
    dm.setAttribute('scale', (scale * amount).toFixed(1));
  };
}

/* 6. Полутон по маске. Глиф (или любая форма) рисуется во внеэкранный canvas, по сетке берутся точки
   внутри формы; радиус точки = база + «волна света», бегущая по точкам в заданном порядке (по углу
   вокруг центра — как будто свет обходит штрих). Точки вне формы — мелкая призрачная сетка. */
export function halftone(canvas, {text = 'a', font = '700 900px "Inter Tight"', cell = 22, ink = '#f5f5f2', ghost = 'rgba(245,245,242,.28)', shape = null} = {}) {
  const W = canvas.width, H = canvas.height;
  const m = document.createElement('canvas'); m.width = W; m.height = H;
  const mg = m.getContext('2d');
  mg.fillStyle = '#fff'; mg.textAlign = 'center'; mg.textBaseline = 'middle'; mg.font = font;
  if (shape) shape(mg, W, H); else mg.fillText(text, W / 2, H / 2 + H * 0.04);
  const data = mg.getImageData(0, 0, W, H).data;
  const pts = [];
  let sx = 0, sy = 0, n = 0;
  for (let y = cell / 2; y < H; y += cell) for (let x = cell / 2; x < W; x += cell) {
    const a = data[(Math.floor(y) * W + Math.floor(x)) * 4 + 3] / 255;
    pts.push({x, y, a}); if (a > 0.5) { sx += x; sy += y; n++; }
  }
  const cx = sx / Math.max(1, n), cy = sy / Math.max(1, n);
  for (const p of pts) p.ang = (Math.atan2(p.y - cy, p.x - cx) + Math.PI) / (Math.PI * 2);
  const g = canvas.getContext('2d');
  return (t, {speed = 0.5, span = 0.28, ghostR = 0.12, baseR = 0.22} = {}) => {
    g.clearRect(0, 0, W, H);
    const head = (t * speed) % 1;
    for (const p of pts) {
      let d = head - p.ang; d -= Math.round(d);
      const lit = p.a > 0.5 ? smoothstep(span, 0, Math.abs(d)) : 0;
      const near = p.a > 0.05 ? 1 : 0;
      const r = cell * (near ? lerp(baseR * p.a, 0.56, lit) : ghostR * 0.6);
      if (r < 0.4) continue;
      g.fillStyle = lit > 0.02 ? ink : near ? ghost : 'rgba(245,245,242,.10)';
      g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill();
    }
  };
}

/* 7. Скруглённый квадрат «как иконка» (суперэллипс) с выгибом сторон.
   bulge = [верх, право, низ, лево] в долях стороны: >0 наружу, <0 внутрь. Даёт «желе» без растяжения текста. */
export function squirclePath(w, h, r = 0.24, bulge = [0, 0, 0, 0]) {
  const R = Math.min(w, h) * r, k = 0.55;
  const [bt, br, bb, bl] = bulge.map((b) => b * Math.min(w, h));
  return [
    `M ${R} 0`,
    `Q ${w / 2} ${-bt * 2} ${w - R} 0`,
    `C ${w - R + R * k} 0 ${w} ${R - R * k} ${w} ${R}`,
    `Q ${w + br * 2} ${h / 2} ${w} ${h - R}`,
    `C ${w} ${h - R + R * k} ${w - R + R * k} ${h} ${w - R} ${h}`,
    `Q ${w / 2} ${h + bb * 2} ${R} ${h}`,
    `C ${R - R * k} ${h} 0 ${h - R + R * k} 0 ${h - R}`,
    `Q ${-bl * 2} ${h / 2} 0 ${R}`,
    `C 0 ${R - R * k} ${R - R * k} 0 ${R} 0 Z`,
  ].join(' ');
}

/* 8. Грань-призма: плитка — это брусок, повёрнутый на 90° к следующей грани (видны две грани сразу).
   turns(t) — положение в «гранях» (1,5 = на полпути между второй и третьей), vel — скорость в гранях/с.
   Возвращает угол, номер передней грани и силу «желе»/смаза от скорости. */
export function prismState(t, stops, {hold = 0.9, move = 0.42} = {}) {
  // stops: число граней; цикл: hold → поворот за move → hold …
  const per = hold + move;
  const i = Math.floor(t / per), u = (t - i * per - hold) / move;
  const p = u <= 0 ? 0 : u >= 1 ? 1 : (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  const dp = u <= 0 || u >= 1 ? 0 : (u < 0.5 ? 12 * u * u : 3 * Math.pow(-2 * u + 2, 2)) / move;
  const turns = i + p;
  return {turns, face: i % stops, next: (i + 1) % stops, angle: -turns * 90, vel: dp};
}

/* 9. ASCII-рендер. Источник (буква, форма, картинка, кадр видео или другой canvas) рисуется во внеэкранный
   canvas, по сетке берётся яркость, клетка получает символ из ряда «редкий → плотный». Проявление — волна
   по колонкам: перед тем как встать, символ несколько кадров перебирает случайные знаки ряда (детерминированно
   от t). Пустые клетки — тусклое поле точек. live: true — источник перечитывается каждый кадр (видео, анимация).
   Шрифт моноширинный: клетка cell × 1.7·cell, символы не налезают друг на друга. */
export function ascii(canvas, {text = 'A', font = '700 900px "Inter Tight"', shape = null, source = null, cell = 18,
  ramp = ' .:-=+*#%@', ink = '#f5f5f2', dim = 'rgba(245,245,242,.38)', field = 'rgba(245,245,242,.10)',
  mono = '"JetBrains Mono", ui-monospace, monospace', live = false, invert = false} = {}) {
  const W = canvas.width, H = canvas.height;
  const cw = cell, ch = Math.round(cell * 1.7);
  const cols = Math.floor(W / cw), rows = Math.floor(H / ch);
  const m = document.createElement('canvas'); m.width = cols; m.height = rows;
  const mg = m.getContext('2d', {willReadFrequently: true});
  const big = document.createElement('canvas'); big.width = W; big.height = H;
  const bg = big.getContext('2d');
  const lv = new Float32Array(cols * rows);
  const sample = (t) => {
    bg.clearRect(0, 0, W, H);
    if (source) bg.drawImage(source, 0, 0, W, H);
    else if (shape) shape(bg, W, H, t);
    else { bg.fillStyle = '#fff'; bg.textAlign = 'center'; bg.textBaseline = 'middle'; bg.font = font; bg.fillText(text, W / 2, H / 2 + H * 0.04); }
    mg.clearRect(0, 0, cols, rows);
    mg.drawImage(big, 0, 0, cols, rows);  // усреднение яркости по клетке делает сам drawImage
    const d = mg.getImageData(0, 0, cols, rows).data;
    for (let i = 0; i < lv.length; i++) {
      const a = d[i * 4 + 3] / 255, y = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
      const v = y * a;
      lv[i] = invert ? (a > 0.02 ? 1 - v : 0) : v;
    }
  };
  let ready = false;
  const g = canvas.getContext('2d');
  const hash = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
  return (t, {reveal = 1, scramble = 0.18, flicker = 0} = {}) => {
    if (live || !ready) { sample(t); ready = true; }
    g.clearRect(0, 0, W, H);
    g.font = `500 ${Math.round(ch * 0.92)}px ${mono}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const tick = Math.floor(t * 24);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, L = lv[i];
      const gate = (c / cols) * 0.85 + hash(i, 1) * 0.15;  // волна слева направо с разбросом
      const x = c * cw + cw / 2, y = r * ch + ch / 2;
      if (L < 0.04) {
        if (field && reveal > gate) { g.fillStyle = field; g.fillText('.', x, y); }
        continue;
      }
      if (reveal < gate) continue;
      const settling = reveal < gate + scramble;
      let k = Math.round(L * (ramp.length - 1));
      if (settling || (flicker && hash(i, tick) < flicker)) k = 1 + Math.floor(hash(i, tick + 7) * (ramp.length - 1));
      const chr = ramp[Math.min(ramp.length - 1, Math.max(1, k))];
      g.fillStyle = L > 0.5 && !settling ? ink : dim;
      g.fillText(chr, x, y);
    }
  };
}
