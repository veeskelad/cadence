#!/usr/bin/env node
// Углы экрана на фото своего устройства и проверка файла corners.json.
//
//   node skills/cadence-structures/scripts/screen_corners.mjs find <config.json>
//   node skills/cadence-structures/scripts/screen_corners.mjs check <corners.json> [--photo-size 4032x3024]
//
// find — ищет рабочую область экрана по переходу «тёмная рамка → светлый интерфейс». По строкам и колонкам
// внутри каждого ребра ищется переход, по точкам ребра строится прямая (МНК с отбросом выбросов: блики, текст
// у края), углы — пересечения прямых. Печатает quad и пишет картинку-проверку screen-quad.png в папку `out`.
// Фото не меняется. Нужен ffmpeg.
//
// config.json для find:
//   { "photo": "../input/photo.jpg", "out": "corners", "dark": 1, "ui": 3, "run": 6,
//     "left":   { "rows": [y0, y1], "x": [от, до] },     поиск слева направо
//     "right":  { "rows": [y0, y1], "x": [от, до] },     справа налево (от > до)
//     "top":    { "cols": [x0, x1], "y": [от, до] },     сверху вниз
//     "bottom": { "cols": [x0, x1], "y": [от, до] } }    сверху вниз: интерфейс → тьма
// Пути photo и out — относительно папки, где лежит сам config.json.
// dark — яркость рамки (0–255, «не ярче»), ui — яркость интерфейса («не темнее»), run — сколько пикселей подряд
// должно быть того и другого. Значения по умолчанию — для тёмного снимка с тёмной рамкой; на светлом фото подними оба.
// Окна поиска — на глаз по уменьшенному фото с запасом ~100 px; строки и колонки — внутри рёбер, не у углов.
//
// check — проверяет corners.json перед сборкой: углы в нужном порядке и выпуклые, кроп в пропорции кадра,
// overscan и фильтры в допустимом виде. Код выхода 1 — есть ошибки.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------- поиск рёбер (чистые функции)

// Переход «≥ run тёмных → ≥ run светлых» при движении от from к to. Возвращает границу (полпикселя) или null.
export function edgeIn(get, from, to, { dark = 1, ui = 3, run = 6 } = {}) {
  const step = to > from ? 1 : -1;
  const runOf = (i, s, test) => { for (let k = 0; k < run; k++) if (!test(get(i + s * k))) return false; return true; };
  for (let i = from; step > 0 ? i < to : i > to; i += step) {
    if (runOf(i - step, -step, (v) => v <= dark) && runOf(i, step, (v) => v >= ui)) return i - step / 2;
  }
  return null;
}

// Переход «≥ run светлых → ≥ run тёмных» при движении вперёд (нижнее ребро сверху вниз).
export function edgeOut(get, from, to, { dark = 1, ui = 3, run = 6 } = {}) {
  const runOf = (i, s, test) => { for (let k = 0; k < run; k++) if (!test(get(i + s * k))) return false; return true; };
  for (let i = from; i < to; i++) if (runOf(i - 1, -1, (v) => v >= ui) && runOf(i, 1, (v) => v <= dark)) return i - 0.5;
  return null;
}

// Прямая v = a·u + c по точкам [u, v]; трижды с сужением допуска — выбросы отбрасываются.
export function fitLine(pts, name = 'ребро') {
  if (pts.length < 10) throw new Error(`${name}: найдено ${pts.length} точек — расширь окно поиска или поправь dark/ui`);
  const once = (p) => {
    const n = p.length;
    const mu = p.reduce((s, q) => s + q[0], 0) / n, mv = p.reduce((s, q) => s + q[1], 0) / n;
    const den = p.reduce((s, q) => s + (q[0] - mu) ** 2, 0);
    if (den === 0) throw new Error(`${name}: все точки в одной строке — окно поиска слишком узкое`);
    const a = p.reduce((s, q) => s + (q[0] - mu) * (q[1] - mv), 0) / den;
    return [a, mv - a * mu];
  };
  let f = once(pts), kept = pts;
  for (const tol of [20, 6, 3]) {
    const next = pts.filter(([u, v]) => Math.abs(v - (f[0] * u + f[1])) <= tol);
    if (next.length < 3) break;
    kept = next;
    f = once(kept);
  }
  return { line: f, found: pts.length, kept: kept.length };
}

// Пересечение «x = a1·y + c1» (лево/право) и «y = a2·x + c2» (верх/низ).
export function crossLines([a1, c1], [a2, c2]) {
  const den = 1 - a1 * a2;
  if (Math.abs(den) < 1e-9) throw new Error('рёбра почти параллельны — углы не найти');
  const x = (a1 * c2 + c1) / den;
  return [x, a2 * x + c2];
}

// Углы по яркости: gray — W·H байт (оттенки серого), cfg — как в config.json.
export function findQuad(gray, W, H, cfg) {
  const th = { dark: cfg.dark ?? 1, ui: cfg.ui ?? 3, run: cfg.run ?? 6 };
  const L = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? gray[y * W + x] : NaN);
  const scan = ([u0, u1], f) => { const pts = []; for (let u = u0; u <= u1; u += 8) { const v = f(u); if (v != null) pts.push([u, v]); } return pts; };
  for (const side of ['left', 'right', 'top', 'bottom']) if (!cfg[side]) throw new Error(`в config нет окна «${side}»`);
  const pts = {
    left: scan(cfg.left.rows, (y) => edgeIn((x) => L(x, y), cfg.left.x[0], cfg.left.x[1], th)),
    right: scan(cfg.right.rows, (y) => edgeIn((x) => L(x, y), cfg.right.x[0], cfg.right.x[1], th)),
    top: scan(cfg.top.cols, (x) => edgeIn((y) => L(x, y), cfg.top.y[0], cfg.top.y[1], th)),
    bottom: scan(cfg.bottom.cols, (x) => edgeOut((y) => L(x, y), cfg.bottom.y[0], cfg.bottom.y[1], th)),
  };
  const fits = Object.fromEntries(Object.entries(pts).map(([k, p]) => [k, fitLine(p, `ребро ${k}`)]));
  const { left: FL, right: FR, top: FT, bottom: FB } = Object.fromEntries(Object.entries(fits).map(([k, v]) => [k, v.line]));
  const quad = [crossLines(FL, FT), crossLines(FR, FT), crossLines(FR, FB), crossLines(FL, FB)]
    .map((p) => p.map((v) => +v.toFixed(1)));
  return { quad, fits };
}

// ---------------------------------------------------------------- проверка corners.json

export function quadProblems(quad) {
  if (!Array.isArray(quad) || quad.length !== 4) return ['quad: нужно ровно 4 угла'];
  const bad = [];
  quad.forEach((p, i) => { if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) bad.push(`quad: угол ${i + 1} — нужна пара чисел [x, y]`); });
  if (bad.length) return bad;
  for (let i = 0; i < 4; i++) {
    const [a, b, c] = [quad[i], quad[(i + 1) % 4], quad[(i + 2) % 4]];
    if (!((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) > 1e-6)) {
      return ['quad: углы не образуют выпуклый четырёхугольник в порядке «левый верх, правый верх, правый низ, левый низ»'];
    }
  }
  return [];
}

const FRAME_RATIOS = { '9:16': 9 / 16, '16:9': 16 / 9 };

export function checkCorners(c, photoSize = null) {
  const errors = [], warnings = [];
  if (!c || typeof c !== 'object' || Array.isArray(c)) return { errors: ['corners.json: нужен объект'], warnings };
  if (typeof c.plate !== 'string' || !c.plate) errors.push('plate: нужен путь к фото');
  else if (path.isAbsolute(c.plate) || c.plate.split(/[\\/]/).includes('..')) errors.push('plate: путь внутри папки проекта, без абсолютных путей и «..»');
  errors.push(...quadProblems(c.quad));
  const crop = c.crop;
  if (!Array.isArray(crop) || crop.length !== 4 || !crop.every(Number.isFinite) || crop[2] <= 0 || crop[3] <= 0 || crop[0] < 0 || crop[1] < 0) {
    errors.push('crop: нужно [x, y, ширина, высота] неотрицательными числами');
  } else {
    const r = crop[2] / crop[3];
    if (!Object.values(FRAME_RATIOS).some((t) => Math.abs(r / t - 1) < 0.01)) errors.push(`crop: пропорция ${r.toFixed(3)} — нужен кадр 9:16 или 16:9`);
    if (photoSize && (crop[0] + crop[2] > photoSize[0] + 0.5 || crop[1] + crop[3] > photoSize[1] + 0.5)) errors.push('crop: выходит за край фото');
    if (!errors.some((e) => e.startsWith('quad'))) {
      const out = c.quad.some(([x, y]) => x < crop[0] || y < crop[1] || x > crop[0] + crop[2] || y > crop[1] + crop[3]);
      if (out) warnings.push('quad: часть экрана за краем кропа — на общем плане экран обрезан');
    }
  }
  if (photoSize && Array.isArray(c.quad) && c.quad.every((p) => Array.isArray(p) && p.every(Number.isFinite))) {
    if (c.quad.some(([x, y]) => x < 0 || y < 0 || x > photoSize[0] || y > photoSize[1])) errors.push('quad: угол за пределами фото');
  }
  if (c.overscan !== undefined && !(Number.isFinite(c.overscan) && c.overscan >= 0 && c.overscan <= 40)) errors.push('overscan: число от 0 до 40 (px экрана)');
  for (const key of ['grade', 'sharpen']) {
    if (c[key] === undefined) continue;
    if (typeof c[key] !== 'string' || /[;\n\r[\]]/.test(c[key])) errors.push(`${key}: строка фильтров ffmpeg через запятую, без «;», «[», «]» и переносов`);
  }
  if (c.glass !== undefined) {
    const g = c.glass;
    if (!g || typeof g !== 'object' || Object.values(g).some((v) => !(Number.isFinite(v) && v >= 0 && v <= 1))) errors.push('glass: значения от 0 до 1');
    else if ((g.glare ?? 0) > 0.15) warnings.push('glass.glare выше 0,15 — блик стекла начнёт читаться нарисованным');
  }
  return { errors, warnings };
}

// ---------------------------------------------------------------- CLI

function probeSize(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]).toString().trim();
  const [W, H] = out.split(',').map(Number);
  if (!(W > 0 && H > 0)) throw new Error(`не прочитал размер фото: ${file}`);
  return [W, H];
}

function writeCheckImage(photo, quad, W, H, outDir) {
  const s = 0.25, w = Math.round(W * s), h = Math.round(H * s);
  const rgb = execFileSync('ffmpeg', ['-v', 'error', '-i', photo, '-vf', `scale=${w}:${h},eq=brightness=.12:gamma=1.5`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: w * h * 3 + 1024 });
  const put = (x, y) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 3; rgb[i] = 0; rgb[i + 1] = 255; rgb[i + 2] = 0; };
  quad.forEach((p, i) => {
    const q = quad[(i + 1) % 4];
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) * s));
    for (let k = 0; k <= n; k++) put((p[0] + ((q[0] - p[0]) * k) / n) * s, (p[1] + ((q[1] - p[1]) * k) / n) * s);
  });
  mkdirSync(outDir, { recursive: true });
  const raw = path.join(outDir, 'screen-quad.rgb'), png = path.join(outDir, 'screen-quad.png');
  writeFileSync(raw, rgb);
  try {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-i', raw, png]);
  } finally {
    unlinkSync(raw);
  }
  return png;
}

function cmdFind(configPath) {
  const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
  if (!cfg.photo || !cfg.out) throw new Error('в config нужны "photo" и "out"');
  const base = path.dirname(path.resolve(configPath));
  const photo = path.resolve(base, cfg.photo), outDir = path.resolve(base, cfg.out);
  if (path.resolve(outDir, 'screen-quad.png') === photo) throw new Error('папка out совпадает с фото — выбери другую');
  const [W, H] = probeSize(photo);
  const gray = execFileSync('ffmpeg', ['-v', 'error', '-i', photo, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: W * H + 1024 });
  const { quad, fits } = findQuad(gray, W, H, cfg);
  for (const [k, f] of Object.entries(fits)) console.log(`${k}: точек ${f.found}, в прямой ${f.kept}`);
  const bad = quadProblems(quad);
  if (bad.length) throw new Error(bad.join('; '));
  console.log(`quad: ${JSON.stringify(quad)}`);
  console.log(`проверка: ${writeCheckImage(photo, quad, W, H, outDir)} — зелёная рамка должна лечь точно по краю интерфейса`);
}

function cmdCheck(file, argv) {
  const i = argv.indexOf('--photo-size');
  let size = null;
  if (i >= 0) {
    const m = /^(\d+)x(\d+)$/.exec(argv[i + 1] ?? '');
    if (!m) throw new Error('--photo-size: формат 4032x3024');
    size = [Number(m[1]), Number(m[2])];
  }
  const { errors, warnings } = checkCorners(JSON.parse(readFileSync(file, 'utf8')), size);
  for (const w of warnings) console.log(`предупреждение: ${w}`);
  for (const e of errors) console.log(`ошибка: ${e}`);
  if (!errors.length) console.log('corners.json в порядке');
  return errors.length ? 1 : 0;
}

function main(argv) {
  const [cmd, file, ...rest] = argv;
  if (cmd === 'find' && file) return cmdFind(file), 0;
  if (cmd === 'check' && file) return cmdCheck(file, rest);
  console.log('использование: screen_corners.mjs find <config.json> | check <corners.json> [--photo-size WxH]');
  return 2;
}

const self = (() => { try { return pathToFileURL(realpathSync(process.argv[1] ?? '')).href; } catch { return ''; } })();
if (import.meta.url === self) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`screen_corners: ${err.message}`);
    process.exitCode = 2;
  }
}
