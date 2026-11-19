// Словарь приёмов: короткие сцены и переходы, из которых собирается анонс, заставка или вставка в ролик.
// У каждого приёма одно слово-имя («эмбарго», «соты», «прожектор»); слово задаёт механику, вид берётся из пака.
//
// Сценарий — film.moves (формат — examples/moves/film.json, словарь и правила —
// knowledge/effects-bank/code-moves.md). Сцены идут подряд; via у сцены — переход, которым она сменяет прошлую.
//
// Две части, как у словаря инфографики:
//   чистые функции (timeline, stateAt, embargoAt, slicesAt, hexAt …) — что видно в момент t,
//   без DOM и памяти между кадрами, поэтому кадр при перемотке тот же;
//   mountMoves(...) — один раз строит элементы и возвращает render(t), который только ставит числа в стили.

import {clamp, lerp, invLerp, power3Out, power2InOut, typeAt, onColor, safeRect} from './board.js';
import {spring} from './motion.js';

// Вход по умолчанию: 0,45 с с замедлением, без перелёта.
export const ENTER = 0.45;
export const rise = (u, d = ENTER) => power3Out(u / d);
const seg = (a, b, u) => power2InOut(invLerp(a, b, u));

// ── слова ─────────────────────────────────────────────────────────────────────
export const MOVES = {
  title: ['титр'],
  embargo: ['эмбарго', 'плашки'],
  stripes: ['полосы'],
  split: ['разлом'],
  carry: ['перенос'],
  hex: ['соты'],
  times: ['крат'],
  breakdown: ['разбор'],
  spotlight: ['прожектор'],
  accordion: ['гармошка'],
  keys: ['клавиши'],
  prompt: ['запрос'],
};
// Переходы: чем сцена сменяет прошлую.
export const VIAS = {
  cut: ['встык'],
  bands: ['ленты'],
  columns: ['колонки'],
  poweroff: ['выключение'],
};
// Длина сцены по умолчанию и длина перехода, секунды.
export const NATURAL = {title: 2.4, embargo: 5.2, stripes: 3.4, split: 3.9, carry: 4.4, hex: 3.7, times: 3.4, breakdown: 4.2, spotlight: 2.7, accordion: 2.2, keys: 4, prompt: 5.4};
export const VIA_DUR = {cut: 0, bands: 1.2, columns: 1.3, poweroff: 0.7};
export const TONES = ['dark', 'light', 'surface', 'accent'];

const norm = (s) => String(s).trim().toLowerCase().replaceAll('ё', 'е');
const index = (dict) => new Map(Object.entries(dict).flatMap(([key, names]) => [[norm(key), key], ...names.map((n) => [norm(n), key])]));
const MOVE_INDEX = index(MOVES), VIA_INDEX = index(VIAS);
const first = (dict) => Object.values(dict).map((n) => n[0]).join(', ');
export function resolveMove(name) {
  const key = MOVE_INDEX.get(norm(name));
  if (!key) throw new Error(`Нет приёма «${name}». Есть: ${first(MOVES)}`);
  return key;
}
export function resolveVia(name) {
  const key = VIA_INDEX.get(norm(name));
  if (!key) throw new Error(`Нет перехода «${name}». Есть: ${first(VIAS)}`);
  return key;
}

// ── время ─────────────────────────────────────────────────────────────────────
export function timeline(moves = []) {
  let t = 0;
  return moves.map((m, i) => {
    const key = resolveMove(m.move);
    const via = i === 0 ? 'cut' : resolveVia(m.via ?? 'cut');
    const start = Number.isFinite(m.at) ? m.at : t;
    const dur = Number(m.dur ?? naturalDur(key, m));
    t = start + dur;
    return {i, key, via, start, end: start + dur, dur};
  });
}
export const totalDuration = (moves) => timeline(moves).reduce((m, s) => Math.max(m, s.end), 0);

// Насколько вперёд промотана первая сцена, чтобы кадр 0 (обложка в ленте) не был пустым.
export const HOOK_LEAD = 0.5;

// Ленты и колонки идут поверх стыка: новая сцена начинает жить на полперехода раньше и приезжает уже собранной.
const lead = (s) => (s.via === 'bands' || s.via === 'columns' ? VIA_DUR[s.via] / 2 : 0);

// Что на экране в момент t: какие сцены видны, сколько секунд каждая прожила, какой переход идёт.
// Выключение съедает хвост уходящей сцены; после него кадр чёрный до начала следующей.
export function stateAt(t, tl, {end, hook = 0} = {}) {
  let tr = null;
  for (let i = 1; i < tl.length; i++) {
    const s = tl[i], D = VIA_DUR[s.via];
    if (!D) continue;
    const a = s.via === 'poweroff' ? s.start - D : s.start - D / 2;
    if (t >= a && t < a + D) tr = {kind: s.via, p: (t - a) / D, out: i - 1, in: s.via === 'poweroff' ? -1 : i};
  }
  const last = tl.at(-1);
  if (!tr && end && last && t >= last.end - VIA_DUR[end]) tr = {kind: end, p: clamp((t - (last.end - VIA_DUR[end])) / VIA_DUR[end]), out: last.i, in: -1};
  const scenes = tl.map((s, i) => {
    const next = tl[i + 1];
    const from = i === 0 ? -Infinity : s.start - lead(s);
    const to = next ? next.start + lead(next) : Infinity;
    return {visible: t >= from && t < to, u: t - (s.start - lead(s)) + (i === 0 ? hook : 0)};
  });
  return {scenes, tr};
}

// ── переходы ──────────────────────────────────────────────────────────────────
// Ленты и колонки: кадр режется на n частей, каждая уезжает в свою сторону и тянет за собой новую сцену.
// e — доля пути части (0 — старая сцена на месте, 1 — новая на месте), dir — сторона, q — время части.
export function slicesAt(p, n = 6, stagger = 0.08) {
  const travel = 1 - stagger * (n - 1);
  return Array.from({length: n}, (_, k) => {
    const q = clamp((clamp(p) - k * stagger) / travel);
    return {q, e: power2InOut(q), dir: k % 2 ? -1 : 1};
  });
}

// Выключение: кадр сжимается в строку (60 % времени), строка в точку (22 %), точка гаснет.
// sy, sx — масштаб кадра; gain — во сколько раз ярче остаток; line и dot — яркость строки и точки.
export function powerOffAt(p) {
  p = clamp(p);
  const a = invLerp(0, 0.6, p), b = invLerp(0.6, 0.82, p), c = invLerp(0.82, 1, p);
  const sy = lerp(1, 0.004, power2InOut(a));
  const sx = lerp(1, 0, power2InOut(b));
  return {sy, sx, gain: 1 + 3 * a * a, line: invLerp(0.55, 0.95, 1 - sy) * (1 - power2InOut(b)), dot: power2InOut(b) * (1 - c) ** 2, black: p > 0};
}

// ── типографика ───────────────────────────────────────────────────────────────
// «Слова [под плашкой] и открытые»: строка → части.
export function parseBracketed(line) {
  const parts = [];
  for (const m of String(line).matchAll(/\[([^\]]*)\]|([^[]+)/g)) parts.push(m[1] !== undefined ? {text: m[1], hidden: true} : {text: m[2], hidden: false});
  return parts;
}

// Эмбарго: текст входит с закрытыми плашками, подпись сменяется на «снято», плашки уходят по одной.
// bars[i] — насколько плашка i убрана (0 закрыта, 1 убрана); slug — смена подписи.
export function embargoAt(u, n, {flip = 2, stagger = 0.47, lift = 0.5} = {}) {
  const t0 = flip + 0.4;
  return {
    enter: rise(u),
    slug: seg(flip, flip + 0.35, u),
    bars: Array.from({length: n}, (_, i) => seg(t0 + i * stagger, t0 + i * stagger + lift, u)),
  };
}
export const embargoLength = (n, {flip = 2, stagger = 0.47, lift = 0.5} = {}) => flip + 0.4 + (n - 1) * stagger + lift;

// Полосы: три косые полосы въезжают слева (фраза видна только внутри них), расширяются в сплошную плашку,
// затем сжимаются в три штриха слева от фразы. a, b — края полосы в долях ширины кадра на высоте текста;
// park — где начинается текст; band — насколько полосы обрезаны до высоты текста; plain — фраза видна и вне полос.
export function stripesAt(u, {park = 0.28, hold = 0.35, stagger = 0.17, sweep = 1} = {}) {
  const rest = [0.4, 0.61, 0.82], hw = 0.04;
  const slabA = park - 0.04, slabW = (0.99 - slabA) / 3;
  const tWide = sweep + 2 * stagger + 0.05, tSlab = tWide + 0.45, tBreak = tSlab + hold;
  const widen = seg(tWide, tSlab, u), brk = seg(tBreak, tBreak + 0.6, u);
  const stripes = rest.map((r, i) => {
    const c = lerp(-0.16 - (2 - i) * 0.1, r, power3Out((u - (2 - i) * stagger) / sweep));   // за кадром полосы тоже стоят по порядку
    let a = lerp(c - hw, slabA + i * slabW, widen), b = lerp(c + hw, slabA + (i + 1) * slabW, widen);
    const slash = park - 0.095 + i * 0.028;
    a = lerp(a, slash - 0.007, brk); b = lerp(b, slash + 0.007, brk);
    return {a, b};
  });
  return {stripes, band: brk, plain: u >= tSlab};
}

// Разлом: заголовок встаёт, по середине проходит луч, половины расходятся, в щели появляется вторая фраза,
// затем щель сужается до 0,6 и остаётся. gap — раскрытие щели (0…1), inner — видимость второй фразы, scale — её кегль.
export function splitAt(u, {hold = 1.07} = {}) {
  const open = seg(1.0, 1.5, u), close = seg(1.5 + hold, 2.0 + hold, u);
  return {enter: rise(u), beam: power3Out(invLerp(0.6, 1.0, u)), gap: open - 0.4 * close, inner: seg(1.25, 1.6, u), scale: lerp(1, 0.76, close)};
}

// Перенос: число растёт порциями. values — остановки; carries[s] — разряды (0 — единицы), из которых
// на шаге s единица переходит в старший разряд.
export function carryPlan(from, to, steps = 5) {
  const n = Math.max(1, Math.round(steps)), chunk = (to - from) / n;
  const values = Array.from({length: n + 1}, (_, i) => (i === n ? to : Math.round(from + chunk * i)));
  const carries = values.slice(1).map((b, i) => {
    const a = values[i], add = b - a, out = [];
    for (let col = 0, p = 10; p <= Math.max(b, 1) * 10; col++, p *= 10) if ((a % p) + (add % p) >= p) out.push(col);
    return out;
  });
  return {values, carries};
}
// Какие разряды изменились между двумя числами.
export function changedColumns(a, b) {
  const out = [];
  for (let col = 0, p = 1; p <= Math.max(a, b, 1); col++, p *= 10) if (Math.floor(a / p) % 10 !== Math.floor(b / p) % 10 || (a < p) !== (b < p)) out.push(col);
  return out;
}
// Шаг: первые 55 % кружок летит в старший разряд, затем цифры меняются и сжимаются (squash гаснет за 0,22 с).
export function carryAt(u, plan, {start = 0.7, step = 0.62} = {}) {
  const n = plan.values.length - 1, x = (u - start) / step;
  if (x < 0) return {value: plan.values[0], step: -1, discs: [], squash: 0};
  const s = Math.min(n - 1, Math.floor(x)), k = x - s;
  const landed = k >= 0.55;
  return {
    value: plan.values[landed ? s + 1 : s], step: s,
    discs: landed ? [] : plan.carries[s].map((col) => ({col, k: k / 0.55})),
    squash: landed ? clamp(1 - ((k - 0.55) * step) / 0.22) : 0,
  };
}
export const carryLength = (plan, {start = 0.7, step = 0.62} = {}) => start + (plan.values.length - 1) * step;

// Соты: ячейки шестиугольного поля. Порядок — по часовой стрелке от верха, как идёт заливка.
export function hexCells(rings = 6) {
  const cells = [];
  for (let q = -rings; q <= rings; q++) {
    for (let r = Math.max(-rings, -q - rings); r <= Math.min(rings, -q + rings); r++) {
      const x = Math.sqrt(3) * (q + r / 2), y = 1.5 * r;
      const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
      const angle = ring === 0 ? 0 : (Math.atan2(x, -y) + 2 * Math.PI) % (2 * Math.PI);
      cells.push({q, r, x, y, ring, angle});
    }
  }
  return cells.sort((a, b) => a.angle - b.angle || a.ring - b.ring);
}
// filled — сколько ячеек закрашено (дробное: последняя ещё растёт), reading — число рядом, идёт вместе с заливкой.
export function hexAt(u, n, value, {start = 0.55, fill = 2.3} = {}) {
  const k = seg(start, start + fill, u);
  const filled = (n * clamp(value, 0, 100) / 100) * k;
  return {k, filled, reading: k >= 1 ? value : Math.min(value, Math.round(value * k))};
}

// ── числа ─────────────────────────────────────────────────────────────────────
// Крат: рядом с числом стоит мелкая единица («%»), она уходит, на плашке плюс доворачивается в знак умножения,
// число вырастает. rot — поворот знака в градусах (0 — плюс, 135 — крест), fig — масштаб числа.
export function timesAt(u) {
  const turn = seg(0.9, 1.6, u), swell = seg(1.3, 1.9, u);
  return {enter: rise(u), unit: 1 - seg(0.9, 1.3, u), rot: 135 * turn, sign: lerp(0.38, 1, turn), fig: lerp(0.42, 1, swell), bright: swell, label: 1.9};
}

// Разбор: доли частей на общей полосе, x0…x1 от 0 до 1, между частями зазор gap.
export function splitSegments(values, gap = 0.02) {
  const total = values.reduce((a, b) => a + b, 0) || 1, room = 1 - gap * (values.length - 1);
  let x = 0;
  return values.map((v) => {
    const w = (v / total) * room, s = {x0: x, x1: x + w};
    x += w + gap;
    return s;
  });
}
// Итог стоит крупно, под ним вырастает полоса; после паузы итог уходит вверх, полоса раздвигается на части,
// у каждой части бежит своё число. parts[i] — доля счёта части i.
export function breakdownAt(u, n, {hold = 1.0, count = 0.9} = {}) {
  const t = 0.5 + hold;
  return {
    enter: rise(u), bar: power3Out(invLerp(0.5, 0.95, u)), lift: seg(t, t + 0.6, u), open: seg(t + 0.45, t + 0.95, u),
    parts: Array.from({length: n}, (_, i) => power3Out(invLerp(t + 0.8 + i * 0.12, t + 0.8 + i * 0.12 + count, u))),
  };
}

// ── заставки знака ────────────────────────────────────────────────────────────
// Прожектор: луч ищет слева, проскакивает знак, возвращается и встаёт на него; затем зал светлеет.
// x — где луч (доля ширины), lit — яркость знака (dim — в темноте, 1 — на свету), house — свет в зале.
// Мах луча мимо знака — сама механика поиска; входов с перелётом здесь нет.
export function spotlightAt(u, {dim = 0.16} = {}) {
  let x;
  if (u < 0.4) x = lerp(0.14, 0.27, seg(0, 0.4, u));
  else if (u < 0.87) x = lerp(0.27, 0.74, seg(0.4, 0.87, u));
  else x = 0.74 + (0.5 - 0.74) * spring(u - 0.87, 9, 0.55);
  const house = seg(1.27, 1.67, u);
  const cover = 1 - invLerp(0.04, 0.19, Math.abs(x - 0.5));
  const lit = dim + (1 - dim) * Math.max(house, cover * cover * (3 - 2 * cover));
  return {x, beam: clamp(u / 0.17) * (1 - 0.35 * house), lit, house};
}

// Гармошка: карточка сложена вертикальными складками и раскрывается в стороны.
// angle — угол складки; панели стоят встык: центр панели x (в ширинах карточки), поворот rot, тень shade
// (плюс — затемнение отвернувшейся складки, минус — блик повёрнутой к свету).
export function pleatsAt(u, n = 6, {foldAngle = 82, shade = 0.55} = {}) {
  const angle = foldAngle * (1 - spring(u - 0.13, 11, 1));   // затухание без перелёта
  const rad = (angle * Math.PI) / 180, w = 1 / n;
  return {
    angle, o: clamp(u / 0.1), lift: lerp(0.92, 1, rise(u, 0.2)), width: Math.cos(rad),
    panels: Array.from({length: n}, (_, i) => ({x: (i - (n - 1) / 2) * w * Math.cos(rad), rot: (i % 2 ? -1 : 1) * angle, shade: (i % 2 ? shade : -0.12) * Math.sin(rad)})),
  };
}

// ── интерфейс ─────────────────────────────────────────────────────────────────
// Клавиши: сочетание «mod+k», «shift+mod+p», последовательность «g i». Модификаторы встают в порядке
// клавиатуры; подписи по умолчанию словами (Cmd, Shift), значками — с glyphs: шрифт системы должен их знать.
const MOD_ORDER = ['ctrl', 'alt', 'shift', 'mod'];
const KEY_ALIAS = {control: 'ctrl', option: 'alt', opt: 'alt', cmd: 'mod', meta: 'mod', command: 'mod', return: 'enter', escape: 'esc', plus: '+'};
const KEY_NAMES = {
  mac: {mod: 'Cmd', shift: 'Shift', alt: 'Opt', ctrl: 'Ctrl', enter: 'Enter', esc: 'Esc', tab: 'Tab', space: 'Space', backspace: 'Del', up: '↑', down: '↓', left: '←', right: '→'},
  win: {mod: 'Ctrl', shift: 'Shift', alt: 'Alt', ctrl: 'Ctrl', enter: 'Enter', esc: 'Esc', tab: 'Tab', space: 'Space', backspace: 'Back', up: '↑', down: '↓', left: '←', right: '→'},
};
const KEY_GLYPHS = {mod: '⌘', shift: '⇧', alt: '⌥', ctrl: '⌃', enter: '↩', tab: '⇥', backspace: '⌫'};
export function parseKeys(keys, {platform = 'mac', glyphs = false} = {}) {
  const names = KEY_NAMES[platform] ?? KEY_NAMES.mac;
  return String(keys).trim().split(/\s+/).filter(Boolean).map((chord) => {
    const ids = chord.split('+').filter(Boolean).map((k) => { const id = k.toLowerCase(); return KEY_ALIAS[id] ?? id; });
    const mods = MOD_ORDER.filter((id) => ids.includes(id)), rest = ids.filter((id) => !MOD_ORDER.includes(id));
    return [...mods, ...rest].map((id) => ({
      id, mod: MOD_ORDER.includes(id),
      legend: (glyphs && platform === 'mac' && KEY_GLYPHS[id]) || names[id] || (id.length === 1 ? id.toUpperCase() : id[0].toUpperCase() + id.slice(1)),
    }));
  });
}

// Порядок нажатий: модификаторы идут вниз первыми и держатся, пока стучит буква; отпускаются в обратном порядке.
// at — момент, когда последняя клавиша сочетания в нижней точке (на него ставят то, что сочетание открывает).
const KEY = {press: 0.1, gap: 0.1, release: 0.33, rise: 0.33, hold: 0.27, linger: 1, leave: 0.27, chord: 0.67};
export function keysPlan(steps = [], opts = {}) {
  const groups = steps.map((s) => {
    const chords = parseKeys(s.keys, opts), hold = s.hold ?? KEY.hold;
    const caps = [];
    chords.forEach((chord, j) => {
      const fire = s.at - (chords.length - 1 - j) * KEY.chord;
      chord.forEach((k, i) => {
        const back = chord.length - 1 - i;
        caps.push({...k, chord: j, down: fire - KEY.press - back * KEY.gap, up: fire + hold + back * KEY.gap});
      });
    });
    const first = Math.min(...caps.map((k) => k.down)), end = Math.max(...caps.map((k) => k.up)) + KEY.release;
    return {at: s.at, label: s.label, caps, chords: chords.length, rise: first - KEY.rise - 0.05, end};
  });
  groups.forEach((g, i) => { g.leave = Math.min(g.end + KEY.linger, groups[i + 1]?.rise ?? Infinity); });
  return groups;
}
// depth — насколько клавиша утоплена (0…1), lit — подпись цветом акцента, пока клавиша внизу.
export function keysAt(u, plan) {
  return plan.map((g) => ({
    enter: rise(u - g.rise, KEY.rise), out: seg(g.leave, g.leave + KEY.leave, u), label: rise(u - g.at),
    caps: g.caps.map((k) => {
      const depth = clamp(seg(k.down, k.down + KEY.press, u) - power3Out(invLerp(k.up, k.up + KEY.release, u)));
      return {depth, lit: depth > 0.5};
    }),
  }));
}
export const keysLength = (plan) => Math.max(0, ...plan.map((g) => g.end));

// Запрос: текст печатается в поле, уходит по кнопке, поле разрастается в окно: слева шаги с галочками,
// справа страница собирается блок за блоком, в конце — плашка «опубликовано».
export function promptPlan(chars, {cps = 60, steps = 3, blocks = 3} = {}) {
  const typeEnd = 0.25 + chars / cps, send = typeEnd + 0.25, swell = send + 0.2, win = swell + 0.6;
  return {cps, chars, steps, blocks, send, swell, win, toast: win + 0.45 + Math.max(steps, blocks) * 0.6, length: win + 0.45 + Math.max(steps, blocks) * 0.6 + 0.45};
}
export function promptAt(u, plan) {
  return {
    enter: rise(u),
    typed: clamp(Math.floor((u - 0.25) * plan.cps), 0, plan.chars),
    ready: u >= 0.25 + plan.chars / plan.cps,
    sent: clamp(1 - Math.abs(u - plan.send - 0.1) / 0.1),
    swell: seg(plan.swell, plan.win, u),
    checks: Array.from({length: plan.steps}, (_, i) => rise(u - (plan.win + 0.6 + i * 0.6), 0.3)),
    blocks: Array.from({length: plan.blocks}, (_, i) => rise(u - (plan.win + 0.15 + i * 0.6))),
    toast: rise(u - plan.toast),
  };
}

// Сколько секунд приёму нужно на свою механику при этом содержимом, без паузы в конце.
export function moveLength(key, m = {}) {
  if (key === 'embargo') return embargoLength((m.lines ?? []).flatMap(parseBracketed).filter((p) => p.hidden).length, {stagger: m.stagger, flip: m.flip});
  if (key === 'carry') return carryLength(carryPlan(Number(m.from ?? 0), Number(m.value ?? 0), m.steps ?? 5), {start: m.start, step: m.step});
  if (key === 'breakdown') return 0.5 + (m.hold ?? 1) + 0.8 + Math.max(0, (m.parts ?? []).length - 1) * 0.12 + 0.9;
  if (key === 'keys') return keysLength(keysPlan(m.steps ?? [], {platform: m.platform}));
  if (key === 'prompt') return promptPlan(String(m.prompt ?? '').length, {steps: Math.min(3, (m.steps ?? [1, 2, 3]).length)}).length;
  return 0;
}
// Длина сцены, если dur не задан: не короче обычной и с паузой 0,9 с после механики.
export const naturalDur = (key, m) => Math.max(NATURAL[key], Math.ceil((moveLength(key, m) + 0.9) * 10) / 10);

// ── проверка сценария ─────────────────────────────────────────────────────────
export function validateMoves(film = {}) {
  const errors = [];
  if (!Array.isArray(film.moves) || !film.moves.length) errors.push('moves: нужен список сцен');
  for (const [i, m] of (film.moves ?? []).entries()) {
    let key;
    try { key = resolveMove(m.move); } catch (e) { errors.push(`сцена ${i + 1}: ${e.message}`); continue; }
    let via = 'cut';
    if (m.via !== undefined) { try { via = resolveVia(m.via); } catch (e) { errors.push(`сцена ${i + 1}: ${e.message}`); } }
    const dur = Number(m.dur ?? naturalDur(key, m));
    if (!(dur >= 0.8)) errors.push(`сцена ${i + 1}: dur меньше 0,8 с — сцену не успеют прочитать`);
    if (dur < VIA_DUR[via] * 1.5) errors.push(`сцена ${i + 1}: переход длится ${VIA_DUR[via]} с, сцена короче полутора переходов`);
    if (m.tone && !TONES.includes(m.tone)) errors.push(`сцена ${i + 1}: tone ${m.tone}, есть ${TONES.join(', ')}`);
    const need = moveLength(key, m);
    if (dur < need) errors.push(`сцена ${i + 1}: dur ${dur} с, приёму «${m.move}» с этим содержимым нужно не меньше ${need.toFixed(1)} с`);
    if (key === 'keys') {
      const steps = m.steps ?? [];
      if (!steps.length || steps.some((x) => !Number.isFinite(x.at) || !x.keys)) errors.push(`сцена ${i + 1}: steps — список сочетаний с at (секунда срабатывания) и keys`);
      else if (keysPlan(steps, {platform: m.platform})[0].rise < 0) errors.push(`сцена ${i + 1}: первое сочетание срабатывает слишком рано, клавиши не успеют встать — at не меньше ${(-keysPlan([{...steps[0], at: 0}], {platform: m.platform})[0].rise).toFixed(1)} с`);
    }
    if ((key === 'spotlight' || key === 'accordion') && !m.text && !m.src) errors.push(`сцена ${i + 1}: нужен знак — text (слово) или src (своя картинка)`);
    if (key === 'carry' && !(Number(m.value) > Number(m.from ?? 0))) errors.push(`сцена ${i + 1}: value должно быть больше from — число растёт`);
    if (key === 'hex' && !(Number(m.value) >= 0 && Number(m.value) <= 100)) errors.push(`сцена ${i + 1}: value — процент от 0 до 100`);
    if (key === 'breakdown' && !((m.parts ?? []).length >= 2 && m.parts.length <= 5)) errors.push(`сцена ${i + 1}: parts — от 2 до 5 частей`);
    if (key === 'embargo' && !(m.lines ?? []).some((l) => /\[[^\]]+\]/.test(l))) errors.push(`сцена ${i + 1}: в lines нет слов в [скобках] — открывать нечего`);
  }
  if (film.end !== undefined) { try { if (resolveVia(film.end) !== 'poweroff') errors.push('end: ролик заканчивает только «выключение»'); } catch (e) { errors.push(`end: ${e.message}`); } }
  return errors;
}

// ── DOM ───────────────────────────────────────────────────────────────────────
// Каждое слово строит свои элементы в section.mv-scene и возвращает tick(u): u — секунды жизни сцены.

function make(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
}
const px = (v) => `${v}px`;
// Строка не шире места: кегль уменьшается под ширину (ширина — по вёрстке, масштаб превью её не меняет).
function fit(node, maxW) {
  const w = node.offsetWidth;
  if (w > maxW) node.style.fontSize = px(parseFloat(node.style.fontSize) * (maxW / w));
}
// Блок строк занимает отведённое место: кегль подбирается по самой широкой строке и по высоте блока.
function fill(rows, maxW, maxH, cap = Infinity) {
  for (const r of rows) r.style.fontSize = '100px';
  const w = Math.max(...rows.map((r) => r.offsetWidth)), h = rows.reduce((sum, r) => sum + r.offsetHeight, 0);
  const size = Math.min(cap, 100 * Math.min(maxW / w, maxH / h));
  for (const r of rows) r.style.fontSize = px(size);
  return size;
}
// Вход: прозрачность и подъём снизу.
function enter(node, k, dy = 40) {
  node.style.opacity = clamp(k * 1.6);
  node.style.transform = `translateY(${(1 - k) * dy}px)`;
}

// Знак: своя картинка (src), слово (text) или оба. Пропорции картинки известны до вёрстки: размер считается сразу.
function lockup(parent, m, size, pics) {
  const n = make('div', 'mv-lockup mv-display', parent);
  n.style.fontSize = px(size);
  if (m.src) {
    const img = make('img', '', n), pic = pics.get(m.src);
    img.src = m.src;
    if (pic) img.style.aspectRatio = pic.w + ' / ' + pic.h;
  }
  if (m.text) make('span', '', n, m.text);
  return n;
}

const BUILD = {
  // Спокойный титр: строки поднимаются по очереди. Нужен как опора для переходов.
  title(c, m) {
    const box = make('div', 'mv-center', c.el);
    const lines = String(m.text ?? '').split('\n').map((s) => make('div', 'mv-display mv-nowrap', box, s));
    fill(lines, c.safe.w * (c.portrait ? 1 : 0.7), c.safe.h * 0.5, (m.size ?? 210) * c.U);
    const sub = m.sub ? make('div', 'mv-body mv-soft', box, m.sub) : null;
    if (sub) sub.style.fontSize = px(46 * c.U);
    return (u) => {
      lines.forEach((n, i) => enter(n, rise(u - 0.05 - i * 0.12), 50 * c.U));
      if (sub) enter(sub, rise(u - 0.3 - lines.length * 0.12), 30 * c.U);
    };
  },

  embargo(c, m) {
    const box = make('div', 'mv-center', c.el);
    const slug = make('div', 'mv-slug mv-body', box);
    slug.dataset.layoutAllowOverlap = '';   // две подписи сменяют друг друга на одном месте
    slug.style.fontSize = px(34 * c.U);
    const before = make('span', 'mv-soft', slug, m.slug ?? 'Под эмбарго');
    const after = make('span', '', slug, m.lifted ?? 'Эмбарго снято');
    const bars = [];
    const rows = (m.lines ?? []).map((line) => {
      const row = make('div', 'mv-display mv-nowrap', box);
      for (const part of parseBracketed(line)) {
        if (!part.hidden) { make('span', '', row, part.text); continue; }
        const wrap = make('span', 'mv-redact', row);
        wrap.dataset.layoutAllowOcclusion = '';   // слово под плашкой закрыто намеренно
        const word = make('span', '', wrap, part.text);
        word.dataset.layoutAllowOcclusion = '';
        bars.push({bar: make('i', '', wrap), word});
      }
      return row;
    });
    fill(rows, c.safe.w * (c.portrait ? 1 : 0.68), c.safe.h * 0.72, (m.size ?? 230) * c.U);
    const hot = m.highlight ?? bars.length - 1;
    bars.forEach((b, i) => { if (i === hot) b.word.style.color = 'var(--signal)'; });
    return (u) => {
      const st = embargoAt(u, bars.length, {stagger: m.stagger, flip: m.flip});
      enter(box, st.enter, 50 * c.U);
      before.style.opacity = 1 - st.slug;
      before.style.transform = `translateY(${-st.slug * 18 * c.U}px)`;
      after.style.opacity = st.slug;
      after.style.transform = `translateY(${(1 - st.slug) * 18 * c.U}px)`;
      bars.forEach((b, i) => {
        b.bar.style.transform = `scaleX(${1 - st.bars[i]})`;
        b.word.style.opacity = st.bars[i] > 0 ? 1 : 0;   // под закрытой плашкой слова нет: хвосты букв не выдают его
      });
    };
  },

  stripes(c, m) {
    const {W, H, U, safe} = c;
    const lines = Array.isArray(m.lines) ? m.lines : (String(m.text ?? '').match(/[^.!?]+[.!?]*/g) ?? ['']).map((s) => s.trim());
    const slant = ((m.slant ?? 18) * Math.PI) / 180;
    const signal = c.readVar('--signal').trim();
    const room = safe.w * 0.14;
    const plain = make('div', 'mv-st-text', c.scene);
    const mask = make('div', 'mv-st-mask', c.scene);
    mask.dataset.layoutIgnore = '';   // та же фраза внутри полос: читается слой под ними
    make('div', 'mv-st-grad', mask);
    const inside = make('div', 'mv-st-text', mask);
    inside.style.color = onColor(signal);
    const blocks = [plain, inside].map((layer) => {
      const rows = lines.map((s) => make('div', 'mv-display mv-nowrap', layer, s));
      const size = fill(rows, safe.w - room, safe.h * 0.6, (m.size ?? 250) * U);
      const h = rows.reduce((sum, r) => sum + r.offsetHeight, 0);
      Object.assign(layer.style, {left: px(safe.x + room), top: px(safe.y + (safe.h - h) / 2)});
      return {size, h};
    });
    const top = safe.y + (safe.h - blocks[0].h) / 2, cy = top + blocks[0].h / 2;
    const park = (safe.x + room) / W;
    // место точки вдоль линии градиента маски (угол 90° + наклон), пиксели
    const L = W * Math.cos(slant) + H * Math.sin(slant);
    const stop = (fx) => ((fx * W - W / 2) * Math.cos(slant) + (cy - H / 2) * Math.sin(slant) + L / 2).toFixed(1);
    const over = (fx) => (Number(stop(fx)) + 0.8).toFixed(1);   // соседние полосы плашки перекрываются, шва нет
    const pad = 0.08 * blocks[0].size;
    return (u) => {
      const st = stripesAt(u, {park, hold: m.hold, stagger: m.stagger});
      const parts = ['transparent 0'];
      for (const s of st.stripes) parts.push('transparent ' + stop(s.a) + 'px', '#000 ' + stop(s.a) + 'px', '#000 ' + over(s.b) + 'px', 'transparent ' + over(s.b) + 'px');
      mask.style.maskImage = mask.style.webkitMaskImage = 'linear-gradient(' + (90 + (m.slant ?? 18)) + 'deg, ' + parts.join(', ') + ')';
      mask.style.clipPath = 'inset(' + st.band * (top - pad) + 'px 0 ' + st.band * (H - top - blocks[0].h - pad) + 'px 0)';
      plain.style.opacity = st.plain ? 1 : 0;
    };
  },

  split(c, m) {
    const {W, U, safe} = c;
    const cy = safe.y + safe.h / 2;
    const signal = c.readVar('--signal').trim();
    const halves = ['top', 'bottom'].map((side) => make('div', 'mv-sp-half mv-sp-' + side + ' mv-display mv-nowrap', c.scene, m.title ?? ''));
    halves[1].dataset.layoutIgnore = '';   // нижняя половина — та же строка, читается верхняя
    halves[0].dataset.layoutAllowOcclusion = '';   // плашка расходит строку намеренно
    const size = fill([halves[0]], safe.w, safe.h * 0.3, (m.size ?? 250) * U);
    halves[1].style.fontSize = px(size);
    const band = make('div', 'mv-sp-band', c.scene);
    const inner = make('div', 'mv-sp-inner mv-display mv-nowrap', band, m.inner ?? '');
    inner.style.color = onColor(signal);
    inner.style.fontSize = px(size * 0.52);
    fit(inner, safe.w * 0.9);
    const innerSize = parseFloat(inner.style.fontSize);
    const G = size * 1.1;
    for (const n of halves) { n.style.left = px(W / 2); n.style.top = px(cy); }
    band.style.top = px(cy);
    return (u) => {
      const st = splitAt(u, {hold: m.hold});
      const dy = (1 - st.enter) * 50 * U;
      halves.forEach((n, i) => {
        n.style.opacity = clamp(st.enter * 1.6);
        n.style.transform = 'translate(-50%, -50%) translateY(' + (dy + ((i ? 1 : -1) * G * st.gap) / 2) + 'px)';
      });
      band.style.height = px(Math.max(10 * U, G * st.gap));
      band.style.transform = 'translateY(-50%) scaleX(' + st.beam + ')';
      band.style.opacity = st.beam > 0 ? 1 : 0;
      inner.style.opacity = st.inner;
      inner.style.fontSize = px(innerSize * st.scale);
    };
  },

  carry(c, m) {
    const {U, safe, portrait} = c;
    const plan = carryPlan(Number(m.from ?? 0), Number(m.value ?? 0), m.steps ?? 5);
    const sep = m.sep ?? ' ';
    const row = make('div', 'mv-center mv-cr-row' + (portrait ? '' : ' mv-cr-wide'), c.el);
    const num = make('div', 'mv-cr-num mv-display mv-num', row);
    const digits = String(plan.values.at(-1)).length;
    const cells = [];   // индекс — разряд, 0 — единицы
    const seps = [];
    for (let col = digits - 1; col >= 0; col--) {
      cells[col] = make('span', 'mv-cr-digit', num, '0');
      if (col % 3 === 0 && col > 0) seps.push({node: make('span', 'mv-cr-sep', num, sep), col});
    }
    const disc = cells.map(() => make('i', 'mv-cr-disc mv-body', num, '1'));
    for (const d of disc) d.dataset.layoutIgnore = '';   // кружок переноса — знак движения, а не строка для чтения
    const cap = m.label ? make('div', 'mv-cr-cap mv-body', row) : null;
    if (cap) for (const line of String(m.label).split('\n')) make('div', '', cap, line);
    const size = fill([num], portrait ? safe.w : safe.w * 0.56, safe.h * 0.34, (m.size ?? 260) * U);
    if (cap) cap.style.fontSize = px(Math.max(30 * U, size * 0.2));
    for (const d of disc) d.style.fontSize = px(size * 0.2);
    const center = cells.map((n) => n.offsetLeft + n.offsetWidth / 2);
    const pitch = digits > 1 ? center[0] - center[1] : size * 0.6;
    return (u) => {
      const st = carryAt(u, plan, {start: m.start, step: m.step});
      const prev = st.step < 0 ? st.value : plan.values[st.step];
      const changed = st.squash > 0 ? changedColumns(prev, st.value) : [];
      const str = String(st.value);
      cells.forEach((n, col) => {
        const ch = str[str.length - 1 - col];
        n.textContent = ch ?? '0';
        n.style.opacity = ch ? 1 : 0;
        n.style.transform = 'scaleY(' + (1 - 0.2 * (changed.includes(col) ? st.squash : 0)) + ')';
      });
      for (const sp of seps) sp.node.style.opacity = str.length > sp.col ? 1 : 0;
      disc.forEach((d, col) => {
        const fly = st.discs.find((x) => x.col === col);
        d.style.opacity = fly ? 1 : 0;
        if (!fly) return;
        const e = power2InOut(fly.k), to = center[col + 1] ?? center[col] - pitch;
        const x = lerp(center[col], to, e);
        const y = -size * (0.2 + 0.22 * Math.sin(Math.PI * e)) + size * 0.34 * invLerp(0.8, 1, fly.k);
        const s = Math.min(1, fly.k / 0.2) * (1 - 0.5 * invLerp(0.85, 1, fly.k));
        d.style.transform = 'translate(' + x + 'px, ' + y + 'px) translate(-50%, -50%) scale(' + s + ')';
      });
      enter(num, rise(u), 50 * U);
      if (cap) enter(cap, rise(u - 0.3), 30 * U);
    };
  },

  hex(c, m) {
    const {U, safe, portrait} = c;
    const cells = hexCells(m.rings ?? 6);
    const value = Number(m.value ?? 0);
    const row = make('div', 'mv-center mv-hx-row' + (portrait ? '' : ' mv-hx-wide'), c.el);
    const xs = cells.map((p) => p.x), ys = cells.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs) - 1, Math.max(...xs) + 1, Math.min(...ys) - 1, Math.max(...ys) + 1];
    const side = Math.min(portrait ? safe.w * 0.86 : safe.w * 0.46, safe.h * (portrait ? 0.5 : 0.86));
    const span = Math.max(x1 - x0, y1 - y0);
    const corner = (i) => { const a = (Math.PI / 180) * (60 * i - 90); return (0.9 * Math.cos(a)).toFixed(3) + ',' + (0.9 * Math.sin(a)).toFixed(3); };
    const points = [0, 1, 2, 3, 4, 5].map(corner).join(' ');
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', [x0, y0, x1 - x0, y1 - y0].join(' '));
    svg.setAttribute('class', 'mv-hx-grid');
    Object.assign(svg.style, {width: px((side * (x1 - x0)) / span), height: px((side * (y1 - y0)) / span)});
    row.appendChild(svg);
    const at = (p, s = 1) => 'translate(' + p.x.toFixed(3) + ' ' + p.y.toFixed(3) + ') scale(' + s.toFixed(3) + ')';
    const poly = (cls, p) => {
      const n = document.createElementNS(ns, 'polygon');
      n.setAttribute('points', points); n.setAttribute('class', cls); n.setAttribute('transform', at(p));
      svg.appendChild(n);
      return n;
    };
    const base = cells.map((p) => poly('mv-hx-base', p));
    const hot = cells.map((p) => {
      const n = poly('mv-hx-hot', p);
      n.style.fill = 'color-mix(in oklab, var(--signal-2) ' + (100 * (1 - (p.y - y0) / (y1 - y0))).toFixed(0) + '%, var(--signal))';
      return n;
    });
    const aside = make('div', 'mv-hx-side', row);
    const read = make('div', 'mv-display mv-num mv-hx-read', aside);
    const figure = make('span', '', read, '0');
    make('span', 'mv-hx-unit mv-soft', read, m.unit ?? '%');
    const label = m.label ? make('div', 'mv-body mv-soft mv-hx-label', aside, m.label) : null;
    read.style.fontSize = px((m.size ?? (portrait ? 190 : 230)) * U);
    if (label) { label.style.fontSize = px(42 * U); label.style.maxWidth = px(portrait ? safe.w * 0.8 : safe.w * 0.34); }
    return (u) => {
      const st = hexAt(u, cells.length, value, {start: m.start, fill: m.fill});
      base.forEach((n, j) => { n.style.opacity = 0.09 * clamp((u - cells[j].ring * 0.04) / 0.25); });
      hot.forEach((n, j) => {
        const s = power3Out(clamp(st.filled - j));
        n.style.opacity = s > 0 ? 1 : 0;
        if (s > 0) n.setAttribute('transform', at(cells[j], lerp(0.35, 1, s)));
      });
      figure.textContent = String(st.reading);
      enter(aside, rise(u - 0.15), 40 * U);
    };
  },

  times(c, m) {
    const {W, H, U, safe, portrait} = c;
    // плашка со знаком: слева в горизонтали, сверху в вертикали
    const panel = make('div', 'mv-tm-panel', c.scene);
    const pw = portrait ? W : W * 0.4, ph = portrait ? H * 0.36 : H;
    Object.assign(panel.style, {width: px(pw), height: px(ph)});
    const sign = make('div', 'mv-tm-sign', panel);
    make('i', '', sign); make('i', '', sign);
    const arm = Math.min(pw, ph) * 0.46;
    Object.assign(sign.style, {width: px(arm), height: px(arm)});
    const area = portrait
      ? {x: safe.x, y: ph + 40 * U, w: safe.w, h: safe.y + safe.h - ph - 40 * U}
      : {x: pw + 70 * U, y: safe.y, w: safe.x + safe.w - pw - 70 * U, h: safe.h};
    const fig = make('div', 'mv-tm-fig mv-display mv-num', c.scene);
    const value = make('span', '', fig, m.value ?? '');
    const unit = make('span', 'mv-tm-unit', fig, m.before ?? '%');
    const size = Math.min(area.h * 0.8, (m.size ?? 760) * U);
    fig.style.fontSize = px(size);
    const vw = value.offsetWidth;
    if (vw > area.w) fig.style.fontSize = px(size * (area.w / vw));
    const fh = fig.offsetHeight;
    Object.assign(fig.style, {left: px(area.x), top: px(area.y + (area.h * 0.72 - fh) / 2)});
    const label = make('div', 'mv-tm-label mv-body', c.scene);
    label.style.fontSize = px(46 * U);
    Object.assign(label.style, {left: px(area.x), top: px(area.y + area.h * 0.78), width: px(Math.min(area.w, 900 * U))});
    const words = String(m.label ?? '').split(/\s+/).filter(Boolean).map((w) => make('span', 'mv-tm-word', label, w + ' '));
    return (u) => {
      const st = timesAt(u);
      sign.style.transform = 'translate(-50%, -50%) rotate(' + st.rot + 'deg) scale(' + st.sign + ')';
      sign.style.opacity = clamp(st.enter * 1.6);
      fig.style.transform = 'translateY(' + (1 - st.enter) * 50 * U + 'px) scale(' + st.fig + ')';
      fig.style.opacity = clamp(st.enter * 1.6) * lerp(0.5, 1, st.bright);
      unit.style.opacity = st.unit;
      unit.style.transform = 'translateY(' + (1 - st.unit) * 0.3 + 'em)';
      words.forEach((n, i) => {
        const k = rise(u - st.label - i * 0.067);
        n.style.opacity = clamp(k * 1.6);
        n.style.transform = 'translateY(' + (1 - k) * 22 * U + 'px)';
      });
    };
  },

  breakdown(c, m) {
    const {U, safe, portrait} = c;
    const parts = m.parts ?? [];
    const values = parts.map((p) => Number(p.value) || 0);
    const cy = safe.h / 2, trackW = portrait ? safe.w : safe.w * 0.78, trackX = (safe.w - trackW) / 2;
    const head = make('div', 'mv-bd-head', c.el);
    const total = make('div', 'mv-display mv-num', head, m.total ?? '');
    const size = fill([total], trackW * 0.7, safe.h * 0.36, (m.size ?? 380) * U);
    const label = m.label ? make('div', 'mv-bd-label mv-display mv-soft', head, m.label) : null;
    if (label) label.style.fontSize = px(size * 0.3);
    const barH = 18 * U;
    const bars = parts.map((p, i) => {
      const n = make('i', 'mv-bd-bar', c.el);
      n.style.height = px(barH);
      n.style.background = 'color-mix(in srgb, var(--signal) ' + (100 - (i * 72) / Math.max(1, parts.length - 1)).toFixed(0) + '%, var(--fg))';
      return n;
    });
    const counts = parts.map((p, i) => {
      const box = make('div', 'mv-bd-count', c.el);
      const num = make('div', 'mv-display mv-num', box, '0');
      num.style.fontSize = px((portrait ? 64 : 84) * U);
      if (i === 0) num.style.color = 'var(--signal)';
      const cap = make('div', 'mv-body mv-soft', box, p.label ?? '');
      cap.style.fontSize = px((portrait ? 28 : 34) * U);
      return {box, num};
    });
    return (u) => {
      const st = breakdownAt(u, parts.length, {hold: m.hold});
      head.style.opacity = clamp(st.enter * 1.6);
      head.style.transform = 'translate(-50%, -50%) translateY(' + ((1 - st.enter) * 50 * U + lerp(cy - size * 0.1, cy - safe.h * 0.2, st.lift)) + 'px) scale(' + lerp(1, 0.6, st.lift) + ')';
      if (label) label.style.opacity = st.lift;
      const barW = trackW * lerp(0.3, 1, st.lift) * st.bar, barX = trackX + (trackW - barW) / 2;
      const barY = lerp(cy + size * 0.52, cy + safe.h * 0.02, st.lift);
      const segs = splitSegments(values, 0.022 * st.open);
      bars.forEach((n, i) => {
        const w = (segs[i].x1 - segs[i].x0) * barW;
        Object.assign(n.style, {left: px(barX + segs[i].x0 * barW), top: px(barY), width: px(w + (st.open < 0.02 ? 1 : 0)), opacity: st.bar > 0 ? 1 : 0});
        n.style.borderRadius = st.open > 0.02 ? px(barH / 2) : (i === 0 ? px(barH / 2) + ' 0 0 ' + px(barH / 2) : i === bars.length - 1 ? '0 ' + px(barH / 2) + ' ' + px(barH / 2) + ' 0' : '0');
        const k = st.parts[i], ct = counts[i];
        ct.num.textContent = String(Math.round(values[i] * k));
        ct.box.style.opacity = clamp(k * 3);
        ct.box.style.transform = 'translate(-50%, 0) translateY(' + (1 - clamp(k * 2)) * 20 * U + 'px)';
        Object.assign(ct.box.style, {left: px(barX + ((segs[i].x0 + segs[i].x1) / 2) * barW), top: px(barY + barH + 26 * U)});
      });
    };
  },

  spotlight(c, m) {
    const {W, H, U, portrait} = c;
    const glowHouse = make('div', 'mv-sl-house', c.scene);
    const soft = make('div', 'mv-sl-soft', c.scene);   // размытие снаружи, обрезка конуса внутри: края мягкие
    const beam = make('div', 'mv-sl-beam', soft);
    const pool = make('div', 'mv-sl-pool', c.scene);
    const stage = make('div', 'mv-sl-stage', c.scene);
    const mark = lockup(stage, m, (m.size ?? 190) * U, c.pics);
    fit(mark, 2 * Math.min(W / 2 - c.safe.x, c.safe.x + c.safe.w - W / 2) * 0.96);
    const floor = H * (portrait ? 0.62 : 0.8), top = -H * 0.04;
    const a = W * 0.04, b = W * (portrait ? 0.36 : 0.24);
    Object.assign(pool.style, {width: px(b * 2.5), height: px(H * 0.07), top: px(floor - H * 0.035)});
    soft.style.filter = pool.style.filter = 'blur(' + 22 * U + 'px)';
    return (u) => {
      const st = spotlightAt(u, {dim: m.dim});
      const fx = st.x * W, ax = (0.5 + (st.x - 0.5) * 0.45) * W;
      beam.style.clipPath = 'polygon(' + (ax - a) + 'px ' + top + 'px, ' + (ax + a) + 'px ' + top + 'px, ' + (fx + b) + 'px ' + floor + 'px, ' + (fx - b) + 'px ' + floor + 'px)';
      beam.style.opacity = st.beam * 0.5;
      pool.style.opacity = st.beam * 0.55;
      pool.style.transform = 'translate(-50%, 0) translateX(' + fx + 'px)';
      mark.style.filter = 'brightness(' + st.lit.toFixed(3) + ')';
      glowHouse.style.opacity = st.house * 0.5;
    };
  },

  accordion(c, m) {
    const {W, H, U} = c;
    const n = Math.max(2, Math.round(m.panels ?? 6));
    const cw = Math.min(W * 0.66, H * 1.3), ch = Math.min(H * 0.4, cw * 0.4), pw = cw / n;
    const stage = make('div', 'mv-ac-stage', c.scene);
    stage.style.perspective = px(1800 * U);
    const card = make('div', 'mv-ac-card', stage);
    Object.assign(card.style, {width: px(cw), height: px(ch)});
    const flat = make('div', 'mv-ac-flat', card);
    const flatMark = lockup(flat, m, (m.size ?? 120) * U, c.pics);
    fit(flatMark, cw * 0.84);
    const markSize = parseFloat(flatMark.style.fontSize);
    const panels = Array.from({length: n}, (_, i) => {
      const p = make('div', 'mv-ac-panel', card);
      p.dataset.layoutIgnore = '';   // складка показывает свой срез знака; читается плоская карточка
      Object.assign(p.style, {width: px(pw + 0.6), marginLeft: px(-pw / 2)});
      const inner = make('div', 'mv-ac-inner', p);
      Object.assign(inner.style, {width: px(cw), left: px(-i * pw)});
      lockup(inner, m, markSize, c.pics);
      return {p, shade: make('i', 'mv-ac-shade', p)};
    });
    return (u) => {
      const st = pleatsAt(u, n, {foldAngle: m.foldAngle, shade: m.shade});
      const isFlat = st.angle < 0.25;
      card.style.opacity = st.o;
      card.style.transform = 'translate(-50%, -50%) scale(' + st.lift + ')';
      flat.style.display = isFlat ? 'flex' : 'none';
      panels.forEach((x, i) => {
        const p = st.panels[i];
        x.p.style.display = isFlat ? 'none' : 'block';
        x.p.style.transform = 'translateX(' + p.x * cw + 'px) rotateY(' + p.rot + 'deg)';
        x.shade.style.background = p.shade >= 0 ? '#000' : '#fff';
        x.shade.style.opacity = Math.abs(p.shade);
      });
    };
  },

  keys(c, m) {
    const {U, safe, portrait} = c;
    const plan = keysPlan(m.steps ?? [], {platform: m.platform, glyphs: m.glyphs});
    const size = (m.size ?? (portrait ? 160 : 200)) * U, travel = size * 0.1;
    const y = safe.h * (m.y ?? 0.6);
    const groups = plan.map((g) => {
      const box = make('div', 'mv-ky-group', c.el);
      box.style.top = px(y);
      const holder = g.label ? make('div', 'mv-ky-label', box) : null;
      const label = holder ? make('div', 'mv-display mv-nowrap', holder, g.label) : null;
      if (label) { label.style.fontSize = px(84 * U); holder.style.bottom = px(size * 1.45); fit(label, safe.w); }
      const row = make('div', 'mv-ky-row', box);
      row.style.gap = px(size * 0.14);
      const tops = [];
      g.caps.forEach((k, i) => {
        if (i > 0 && k.chord !== g.caps[i - 1].chord) make('span', 'mv-ky-then mv-body mv-soft', row, m.then ?? 'затем').style.fontSize = px(size * 0.2);
        const cap = make('div', 'mv-ky-cap', row);
        Object.assign(cap.style, {height: px(size), minWidth: px(size), borderRadius: px(size * 0.2)});
        const top = make('span', 'mv-ky-top mv-body', cap, k.legend);
        Object.assign(top.style, {fontSize: px(size * (k.legend.length > 1 ? 0.26 : 0.4)), borderRadius: px(size * 0.18), padding: '0 ' + px(size * 0.26), marginBottom: px(travel * 1.5)});
        tops.push(top);
      });
      return {box, label, tops};
    });
    return (u) => {
      const st = keysAt(u, plan);
      groups.forEach((g, i) => {
        const s = st[i];
        g.box.style.opacity = clamp(s.enter * 1.6) * (1 - s.out);
        g.box.style.transform = 'translate(-50%, -50%) translateY(' + ((1 - s.enter) * 40 - s.out * 46) * U + 'px) scale(' + (1 - 0.08 * s.out) + ')';
        if (g.label) enter(g.label, s.label, 26 * U);
        g.tops.forEach((top, j) => {
          top.style.transform = 'translateY(' + s.caps[j].depth * travel + 'px)';
          top.style.color = s.caps[j].lit ? 'var(--signal)' : '';
        });
      });
    };
  },

  prompt(c, m) {
    const {U, safe, portrait} = c;
    const text = String(m.prompt ?? '');
    const steps = (m.steps ?? ['Первый экран', 'Тарифы', 'Форма заявки']).slice(0, 3);
    const tiers = (m.tiers ?? [{name: 'Старт', price: '0 ₽'}, {name: 'Про', price: '990 ₽'}, {name: 'Команда', price: '2 900 ₽'}]).slice(0, 3);
    const plan = promptPlan(text.length, {steps: steps.length});
    const r0 = {w: Math.min(safe.w, 1180 * U), h: (portrait ? 420 : 270) * U};
    const r1 = {w: safe.w, h: safe.h * (portrait ? 1 : 0.96)};
    const card = make('div', 'mv-pr-card', c.el);
    card.dataset.layoutAllowOverlap = '';   // поле и окно сменяют друг друга в одной карточке

    const ask = make('div', 'mv-pr-ask', card);
    const line = make('div', 'mv-pr-line mv-body', ask);
    line.dataset.layoutIgnore = '';   // набранный запрос остаётся в окне слева, читают его там
    line.style.fontSize = px(46 * U);
    const typed = make('span', '', line);
    make('i', 'mv-pr-caret', line);
    const send = make('div', 'mv-pr-send', ask);
    make('i', '', send);

    const win = make('div', 'mv-pr-win', card);
    const bar = make('div', 'mv-pr-bar', win);
    make('i', 'mv-pr-dot', bar); make('i', 'mv-pr-dot', bar); make('i', 'mv-pr-dot', bar);
    make('span', 'mv-pr-url mv-mono', bar, m.url ?? 'preview.local').style.fontSize = px(28 * U);
    const publish = make('span', 'mv-pr-publish mv-body', bar, m.publish ?? 'Опубликовать');
    publish.style.fontSize = px(28 * U);
    const body = make('div', 'mv-pr-body' + (portrait ? ' mv-pr-tall' : ''), win);
    const side = make('div', 'mv-pr-side', body);
    make('div', 'mv-pr-bubble mv-body', side, text).style.fontSize = px(28 * U);
    const checks = steps.map((s) => {
      const rowEl = make('div', 'mv-pr-step mv-body', side);
      rowEl.style.fontSize = px(34 * U);
      const tick = make('i', 'mv-pr-tick', rowEl);
      make('span', '', rowEl, s);
      return {rowEl, tick};
    });
    const page = make('div', 'mv-pr-page', body);
    const hero = make('div', 'mv-pr-block', page);
    make('div', 'mv-display mv-pr-h1', hero, m.headline ?? 'Ролики из кода').style.fontSize = px((portrait ? 62 : 84) * U);
    make('div', 'mv-pr-hero', hero);
    const pricing = make('div', 'mv-pr-block mv-pr-tiers', page);
    for (const t of tiers) {
      const tier = make('div', 'mv-pr-tier', pricing);
      make('div', 'mv-body mv-soft', tier, t.name).style.fontSize = px(28 * U);
      make('div', 'mv-display mv-num', tier, t.price).style.fontSize = px((portrait ? 48 : 64) * U);
    }
    const wait = make('div', 'mv-pr-block mv-pr-wait', page);
    make('span', 'mv-pr-field', wait);
    make('span', 'mv-pr-cta mv-body', wait, m.cta ?? 'В лист ожидания').style.fontSize = px(30 * U);
    const blocks = [hero, pricing, wait];
    const toast = make('div', 'mv-pr-toast mv-body', page, m.live ?? 'Опубликовано');
    toast.style.fontSize = px(30 * U);

    return (u) => {
      const st = promptAt(u, plan);
      const w = lerp(r0.w, r1.w, st.swell), h = lerp(r0.h, r1.h, st.swell);
      Object.assign(card.style, {width: px(w), height: px(h), left: px((safe.w - w) / 2), top: px((safe.h - h) / 2), borderRadius: px(lerp(34, 22, st.swell) * U)});
      card.style.opacity = clamp(st.enter * 1.6);
      card.style.transform = 'translateY(' + (1 - st.enter) * 50 * U + 'px)';
      typed.textContent = typeAt(text, st.typed / plan.cps, plan.cps);
      ask.style.opacity = clamp(1 - st.swell * 2.4);
      send.style.background = st.ready ? 'var(--signal)' : '';
      send.style.transform = 'scale(' + (1 - 0.14 * st.sent) + ')';
      win.style.opacity = clamp(st.swell * 2.4 - 1.2);
      checks.forEach((ck, i) => {
        ck.tick.style.transform = 'scale(' + st.checks[i] + ')';
        ck.rowEl.style.opacity = lerp(0.45, 1, st.checks[i]);
      });
      blocks.forEach((b, i) => enter(b, st.blocks[i], 36 * U));
      enter(toast, st.toast, 30 * U);
      publish.style.background = st.toast > 0.5 ? 'var(--positive)' : '';
    };
  },
};

export async function mountMoves({box, film, W, H, readVar}) {
  const errors = validateMoves(film);
  if (errors.length) throw new Error('Сценарий moves: ' + errors.join('; '));
  const portrait = H > W;
  const U = (Math.min(W, H) / 1080) * (film.scale ?? 1);
  const safe = safeRect(W, H, film.safe);
  const tl = timeline(film.moves);
  const endKind = film.end !== undefined ? resolveVia(film.end) : undefined;
  const palette = ['--signal', '--signal-2', '--positive'].map((n) => readVar(n).trim());
  box.style.setProperty('--u', U);

  // свои картинки знака: пропорции нужны до вёрстки
  const pics = new Map();
  await Promise.all(film.moves.filter((m) => m.src).map(async (m) => {
    const img = new Image();
    img.src = m.src;
    await img.decode().catch(() => {});
    if (img.naturalWidth) pics.set(m.src, {w: img.naturalWidth, h: img.naturalHeight});
  }));

  const black = make('div', 'mv-black', box);
  const scenes = tl.map((s, idx) => {
    const m = film.moves[idx];
    const el = make('section', 'mv-scene', box);
    el.dataset.tone = m.tone ?? 'dark';
    el.dataset.move = s.key;
    // свой шрифт сцены: имя из engine/fonts, иначе шрифт пака
    if (m.font) el.style.setProperty('--font-display', `"${m.font}", sans-serif`);
    if (m.weight) el.style.setProperty('--w-display', m.weight);
    const pad = make('div', 'mv-safe', el);
    Object.assign(pad.style, {left: px(safe.x), top: px(safe.y), width: px(safe.w), height: px(safe.h)});
    const ctx = {el: pad, scene: el, W, H, U, portrait, safe, palette, readVar, pics, dur: s.dur};
    return {el, tick: BUILD[s.key](ctx, m), tl: s};
  });
  const fx = make('div', 'mv-fx', box);
  fx.dataset.layoutIgnore = '';   // слой перехода: копии сцен, читать их не нужно
  const glow = make('div', 'mv-tube', box);
  const line = make('i', 'mv-tube-line', glow), dot = make('i', 'mv-tube-dot', glow);

  // Части кадра для лент и колонок: копии обеих сцен, каждая часть в своём окне.
  function drawSlices(tr) {
    const horiz = tr.kind === 'bands';
    const n = horiz ? (portrait ? 8 : 6) : (portrait ? 4 : 5);
    const parts = slicesAt(tr.p, n);
    const size = (horiz ? H : W) / n, travel = horiz ? W : H;
    const sources = [scenes[tr.out].el, scenes[tr.in].el];
    fx.replaceChildren();
    parts.forEach((p, k) => {
      const cell = make('div', 'mv-slice', fx);
      Object.assign(cell.style, horiz
        ? {left: 0, top: px(Math.floor(k * size)), width: px(W), height: px(Math.ceil(size) + 1)}
        : {top: 0, left: px(Math.floor(k * size)), height: px(H), width: px(Math.ceil(size) + 1)});
      const dOut = p.dir * p.e * travel;
      sources.forEach((src, j) => {
        const d = j === 0 ? dOut : dOut - p.dir * travel;
        const inner = make('div', 'mv-slice-in', cell);
        Object.assign(inner.style, {width: px(W), height: px(H)});
        inner.style.transform = horiz ? `translate(${d}px, ${-Math.floor(k * size)}px)` : `translate(${-Math.floor(k * size)}px, ${d}px)`;
        const copy = src.cloneNode(true);
        copy.style.display = 'block';
        copy.style.transform = copy.style.filter = '';
        inner.appendChild(copy);
      });
      // цветной блок едет на шве между старой и новой частью
      if (p.q > 0 && p.q < 1) {
        const seam = p.dir > 0 ? dOut : travel + dOut;
        const thick = (horiz ? 0.05 + 0.07 * (((k * 7) % 5) / 4) : 0.025 + 0.03 * (((k * 7) % 5) / 4)) * travel;
        const block = make('div', 'mv-slice-block', cell);
        block.style.background = palette[k % palette.length];
        Object.assign(block.style, horiz
          ? {top: 0, bottom: 0, left: px(seam - thick / 2), width: px(thick)}
          : {left: 0, right: 0, top: px(seam - thick / 2), height: px(thick)});
      }
    });
  }

  return function render(t) {
    const st = stateAt(t, tl, {end: endKind, hook: film.hookAtZero === false ? 0 : HOOK_LEAD});
    scenes.forEach((sc, i) => {
      const s = st.scenes[i];
      sc.el.style.display = s.visible ? 'block' : 'none';
      sc.el.style.transform = sc.el.style.filter = '';
      if (s.visible) sc.tick(s.u);
    });
    const tr = st.tr;
    const slicing = tr && (tr.kind === 'bands' || tr.kind === 'columns');
    fx.style.display = slicing ? 'block' : 'none';
    if (slicing) {
      drawSlices(tr);
      scenes[tr.out].el.style.display = scenes[tr.in].el.style.display = 'none';
    } else if (fx.childNodes.length) fx.replaceChildren();
    const off = tr?.kind === 'poweroff' ? powerOffAt(tr.p) : null;
    black.style.display = glow.style.display = off?.black ? 'block' : 'none';
    if (off) {
      const el = scenes[tr.out].el;
      el.style.display = off.sx > 0.002 ? 'block' : 'none';
      el.style.transform = `scale(${off.sx}, ${off.sy})`;
      el.style.filter = `brightness(${off.gain})`;
      line.style.opacity = off.line;
      line.style.transform = `scaleX(${off.sx})`;
      dot.style.opacity = off.dot;
      dot.style.transform = `translate(-50%, -50%) scale(${0.25 + off.dot * 0.75})`;
    }
  };
}
