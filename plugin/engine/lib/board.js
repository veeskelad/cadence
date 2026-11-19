// Словарь инфографики: ролик-объяснение собирается из сцен, у каждой сцены одно слово-имя
// («счётчик», «весы», «конвейер»). Слово задаёт механику — что входит, что меняется, как сцена держит
// внимание; вид берётся из пака (цвета, шрифты) и материала сцены (бумага, стекло, плоско).
//
// Сценарий — film.words (формат — examples/board-explainer/film.json, словарь и правила —
// knowledge/effects-bank/code-board-explainer.md). Время сцены — dur в секундах или at: "@якорь" на слове речи
// (scripts/word_anchors.py превращает якоря в секунды); элементы внутри сцены встают по очереди.
//
// Две части, как у слоя доказательств:
//   чистые функции (timeline, cameraAt, appear, countAt, typeAt, tornPolygon …) — что видно в момент t,
//   без DOM и памяти между кадрами, поэтому кадр при перемотке тот же;
//   mountBoard(...) — один раз строит элементы и возвращает render(t), который только ставит числа в стили.

import {ICONS, ALIASES as ICON_ALIASES} from './board-icons.js';

// ── числа и кривые ────────────────────────────────────────────────────────────
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a || 1e-9));
export const power3Out = (u) => 1 - (1 - clamp(u)) ** 3;
export const power2InOut = (u) => (u = clamp(u), u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
export const backOut = (u, s = 1.4) => (u = clamp(u) - 1, 1 + (s + 1) * u ** 3 + s * u ** 2);
export function rng(seed = 1) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Характер движения. smooth — правило по умолчанию: вход 0,45 с с замедлением, без перелёта и удара.
// snappy — короткий «щелчок» с маленьким перелётом, как у вырезок, которые хлопают на доску.
export const MOTION = {
  smooth: {enter: 0.45, overshoot: 0, stagger: 0.12, transition: 0.6},
  snappy: {enter: 0.28, overshoot: 1.5, stagger: 0.08, transition: 0.45},
};

// ── слова ─────────────────────────────────────────────────────────────────────
// Ключ кода → русские имена. Слово ищется без учёта регистра и ё/е.
export const WORDS = {
  headline: ['заголовок', 'слова'],
  ransom: ['вырезки', 'буквы'],
  tag: ['бирка'],
  card: ['карточка', 'стикер'],
  strike: ['зачеркнуть', 'было-стало'],
  highlight: ['маркер', 'цитата'],
  bubble: ['пузырь', 'реплики'],
  counter: ['счётчик', 'число'],
  cheque: ['чек'],
  receipt: ['квитанция', 'расчёт'],
  equation: ['уравнение', 'формула'],
  timer: ['секундомер', 'таймер'],
  calendar: ['календарь', 'дата'],
  scale: ['весы', 'перевес'],
  bars: ['столбики', 'график'],
  sizes: ['размер', 'мало-много'],
  jar: ['банка', 'предел'],
  stack: ['стопка', 'копится'],
  fix: ['до-после', 'исправлено'],
  step: ['шаг'],
  pipeline: ['конвейер', 'вход-выход'],
  terminal: ['терминал', 'запрос'],
  progress: ['загрузка'],
  wave: ['волна', 'громкость'],
  signals: ['пик', 'сигналы'],
  filmstrip: ['плёнка', 'таймлайн'],
  cards: ['карточки', 'варианты'],
  ranking: ['рейтинг', 'топ'],
  table: ['таблица', 'список'],
  grid: ['сетка', 'неделя'],
  mosaic: ['мозаика', 'много'],
  fan: ['веер'],
  icon: ['значок', 'символ', 'нет'],
  badge: ['медаль'],
  screen: ['экран', 'телефон', 'телевизор'],
  photo: ['фото', 'полароид'],
  search: ['поиск'],
  orbit: ['орбита', 'везде'],
  subscribe: ['вопрос', 'подписка'],
};
const norm = (s) => String(s).trim().toLowerCase().replaceAll('ё', 'е');
// Слова-варианты: русское имя включает свой вид того же ключа (поля сцены сильнее).
export const PRESETS = {нет: {cross: true}, телевизор: {device: 'tv'}, телефон: {device: 'phone'}, экран: {device: 'phone'}};
export const withPreset = (w) => ({...(PRESETS[norm(w.word)] ?? {}), ...w});
const WORD_INDEX = new Map(Object.entries(WORDS).flatMap(([key, names]) => [[norm(key), key], ...names.map((n) => [norm(n), key])]));
export function resolveWord(name) {
  const key = WORD_INDEX.get(norm(name));
  if (!key) throw new Error(`Нет слова «${name}». Есть: ${Object.values(WORDS).map((n) => n[0]).join(', ')}`);
  return key;
}

// ── время ─────────────────────────────────────────────────────────────────────
// Сцены идут подряд; at у сцены ставит её начало явно (секунды от начала ролика).
export function timeline(words = []) {
  let t = 0;
  return words.map((w, i) => {
    const start = Number.isFinite(w.at) ? w.at : t;
    // без dur сцена длится до начала следующей (at из якорей речи), иначе 3,5 с
    const next = words[i + 1];
    const dur = Number(w.dur ?? (Number.isFinite(next?.at) ? next.at - start : 3.5));
    t = start + dur;
    return {i, key: resolveWord(w.word), start, end: start + dur, dur};
  });
}
export const totalDuration = (words) => timeline(words).reduce((m, s) => Math.max(m, s.end), 0);

// Камера над доской. Смена сцены — движение камеры, а не исчезновение: pan-up / pan-left (доска уезжает,
// следующая часть приезжает), push (камера ныряет в старую сцену, новая проявляется из тени),
// tear (полоса рваной бумаги проходит по кадру, сцена меняется под ней), cut (встык).
// Насколько вперёд промотана первая сцена, чтобы её заголовок стоял уже на кадре 0.
export const HOOK_LEAD = 1.2;

export const TRANSITIONS = ['pan-up', 'pan-left', 'push', 'tear', 'cut'];
// exit — уход последней сцены к концу ролика тем же движением (доска поверх записи не должна пропадать на склейке);
// он кончается ровно на конце сцены, а не за ним, как переход между сценами.
export function cameraAt(t, tl, {W = 1920, H = 1080, transition = 0.6, kinds = [], exit = null} = {}) {
  return tl.map((s, i) => {
    const next = tl[i + 1], prev = tl[i - 1];
    const kindIn = kinds[i] ?? 'pan-up', kindOut = next ? (kinds[i + 1] ?? 'pan-up') : 'cut';
    const half = transition / 2;
    const st = {visible: false, x: 0, y: 0, scale: 1, blur: 0, dim: 0, o: 1};
    const from = i === 0 ? -Infinity : prev && kindIn !== 'cut' ? s.start - half : s.start;   // первая сцена видна с кадра 0
    const to = next && kindOut !== 'cut' ? s.end + half : s.end;
    if (t < from || t >= to) return st;
    st.visible = true;
    if (prev && kindIn !== 'cut' && t < s.start + half) {
      const u = power2InOut(invLerp(s.start - half, s.start + half, t));
      if (kindIn === 'pan-up') st.y = (1 - u) * H;
      else if (kindIn === 'pan-left') st.x = (1 - u) * W;
      else if (kindIn === 'push') { st.scale = lerp(0.92, 1, u); st.dim = 1 - u; }
      else if (kindIn === 'tear') st.visible = u >= 0.5;
    }
    if (next && kindOut !== 'cut' && t > s.end - half) {
      const u = power2InOut(invLerp(s.end - half, s.end + half, t));
      if (kindOut === 'pan-up') st.y = -u * H;
      else if (kindOut === 'pan-left') st.x = -u * W;
      else if (kindOut === 'push') { st.scale = lerp(1, 1.7, u); st.blur = u * 18; st.o = 1 - invLerp(0.55, 1, u); }
      else if (kindOut === 'tear') st.visible = u < 0.5;
    }
    if (!next && exit && exit !== 'cut' && t > s.end - transition) {
      const u = power2InOut(invLerp(s.end - transition, s.end, t));
      if (exit === 'pan-up') st.y = -u * H;
      else if (exit === 'pan-left') st.x = -u * W;
      else if (exit === 'push') { st.scale = lerp(1, 1.7, u); st.blur = u * 18; st.o = 1 - invLerp(0.55, 1, u); }
      else if (exit === 'fade') st.o = 1 - u;
    }
    return st;
  });
}
// Полоса рваной бумаги для перехода tear: x левого края в долях кадра (от 1.1 до -1.1).
export function tearAt(t, tl, {transition = 0.6, kinds = []} = {}) {
  for (let i = 1; i < tl.length; i++) {
    if ((kinds[i] ?? 'pan-up') !== 'tear') continue;
    const u = invLerp(tl[i].start - transition / 2, tl[i].start + transition / 2, t);
    if (u > 0 && u < 1) return {i, x: lerp(1.05, -1.25, power2InOut(u))};
  }
  return null;
}

// Вход элемента: u — секунды от его начала. Возвращает прозрачность, сдвиг, масштаб, поворот.
// pop — растёт из 0,7; drop — падает сверху и ложится, тень сжимается; slide — въезжает сбоку;
// stamp — штамп опускается из крупного; rise — всплывает снизу; fade — только прозрачность; none — стоит.
export function appear(u, kind = 'pop', motion = MOTION.smooth) {
  const d = motion.enter;
  const k = clamp(u / d);
  const e = motion.overshoot ? backOut(k, motion.overshoot) : power3Out(k);
  const o = kind === 'none' ? 1 : clamp(u / (d * 0.6));
  const st = {o, x: 0, y: 0, s: 1, r: 0, lift: 0};
  if (u <= 0 && kind !== 'none') return {...st, o: 0};
  if (kind === 'pop') st.s = lerp(0.7, 1, e);
  else if (kind === 'drop') { st.y = (1 - e) * -90; st.s = lerp(1.18, 1, e); st.lift = 1 - power3Out(k); }
  else if (kind === 'slide') st.x = (1 - e) * -140;
  else if (kind === 'slide-r') st.x = (1 - e) * 140;
  else if (kind === 'rise') st.y = (1 - e) * 70;
  else if (kind === 'stamp') { st.s = lerp(1.6, 1, power3Out(k)); st.r = (1 - power3Out(k)) * -8; }
  return st;
}

// Число бежит по остановкам: stops — [от, …, до]; каждая следующая остановка — своя доля времени.
export function countAt(u, dur, stops) {
  const list = Array.isArray(stops) ? stops : [0, stops];
  if (list.length === 1 || u >= dur) return list.at(-1);
  if (u <= 0) return list[0];
  const n = list.length - 1, seg = dur / n;
  const i = Math.min(n - 1, Math.floor(u / seg));
  return lerp(list[i], list[i + 1], power3Out((u - i * seg) / seg));
}
export function formatNumber(v, {decimals = 0, sep = ',', point = '.'} = {}) {
  const neg = v < 0;
  const fixed = Math.abs(v).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return (neg ? '−' : '') + grouped + (frac ? point + frac : '');
}
// Печать по буквам: cps — знаков в секунду.
export const typeAt = (text, u, cps = 28) => String(text).slice(0, Math.max(0, Math.floor(u * cps)));

// Рваный край: многоугольник clip-path в процентах, зубцы по четырём сторонам, с зерном seed.
export function tornPolygon(seed = 1, jag = 1.6, teeth = 14) {
  const r = rng(seed);
  const pts = [];
  const j = () => (r() * jag).toFixed(2);
  for (let i = 0; i <= teeth; i++) pts.push(`${((i / teeth) * 100).toFixed(2)}% ${j()}%`);
  for (let i = 1; i <= teeth / 2; i++) pts.push(`${(100 - +j()).toFixed(2)}% ${((i / (teeth / 2)) * 100).toFixed(2)}%`);
  for (let i = teeth - 1; i >= 0; i--) pts.push(`${((i / teeth) * 100).toFixed(2)}% ${(100 - +j()).toFixed(2)}%`);
  for (let i = teeth / 2 - 1; i >= 1; i--) pts.push(`${j()}% ${((i / (teeth / 2)) * 100).toFixed(2)}%`);
  return `polygon(${pts.join(', ')})`;
}

// Цвет текста на заливке: тёмный на светлой, светлый на тёмной.
export function luminance(hex) {
  const m = /^#?([\da-f]{6})$/i.exec(String(hex).trim());
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => (v /= 255, v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
// Цвет текста на заливке — тот из двух, у которого контраст выше (не меньше 3:1 на крупном тексте).
export const onColor = (hex, dark = '#151413', light = '#F4F1EA') => {
  const L = luminance(hex);
  return contrast(L, luminance(dark)) >= contrast(L, luminance(light)) ? dark : light;
};

// Рабочая зона: в вертикали — с запасом под интерфейс площадки (сверху 15 %, снизу 25 %, справа 18 %).
export function safeRect(W, H, safe) {
  if (safe) return {x: safe[0] * W, y: safe[1] * H, w: safe[2] * W, h: safe[3] * H};
  return H > W ? {x: 0.06 * W, y: 0.15 * H, w: 0.76 * W, h: 0.6 * H} : {x: 0.06 * W, y: 0.09 * H, w: 0.88 * W, h: 0.82 * H};
}

// Деление рабочей зоны для составной сцены: доли split (по умолчанию главному 0,58, остальным поровну).
export function splitZone(safe, n, portrait, split) {
  if (n <= 1) return [safe];
  const shares = split?.length === n ? split : [0.58, ...Array(n - 1).fill(0.42 / (n - 1))];
  const gap = 0.03;
  let at = 0;
  return shares.map((k) => {
    const z = portrait
      ? {x: safe.x, y: safe.y + at * safe.h, w: safe.w, h: (k - gap / 2) * safe.h}
      : {x: safe.x + at * safe.w, y: safe.y, w: (k - gap / 2) * safe.w, h: safe.h};
    at += k;
    return z;
  });
}

// Проверка сценария до сборки.
export function validateFilm(film = {}) {
  const errors = [];
  if (!Array.isArray(film.words) || !film.words.length) errors.push('words: нужен список сцен');
  for (const [i, w] of (film.words ?? []).entries()) {
    try { resolveWord(w.word); } catch (e) { errors.push(`сцена ${i + 1}: ${e.message}`); }
    for (const x of w.with ?? []) { try { resolveWord(x.word); } catch (e) { errors.push(`сцена ${i + 1}, with: ${e.message}`); } }
    if ((w.with ?? []).length > 2) errors.push(`сцена ${i + 1}: в with не больше двух слов — иначе сцену не прочитать`);
    if (w.transition && !TRANSITIONS.includes(w.transition)) errors.push(`сцена ${i + 1}: переход ${w.transition}, есть ${TRANSITIONS.join(', ')}`);
    if (w.safe !== undefined && !(Array.isArray(w.safe) && w.safe.length === 4 && w.safe.every((v) => v >= 0 && v <= 1) && w.safe[0] + w.safe[2] <= 1.001 && w.safe[1] + w.safe[3] <= 1.001)) errors.push(`сцена ${i + 1}: safe — [x, y, w, h] в долях кадра, внутри кадра`);
    // поверх записи сцена держит целое предложение голоса: короче 2,5 с предметы не успевают встать и уже уходят
    if (film.over) { const tl = timeline(film.words ?? []); if (tl[i] && tl[i + 1] && tl[i].dur < 2.5) errors.push(`сцена ${i + 1}: ${tl[i].dur.toFixed(2)} с — поверх записи сцена от 2,5 с, объедини фразы через with`); }
    if (w.dur !== undefined && !(w.dur > 0.8)) errors.push(`сцена ${i + 1}: dur меньше 0,8 с — сцену не успеют прочитать`);
  }
  if (film.material && !['paper', 'glass', 'flat'].includes(film.material)) errors.push(`material: ${film.material}, есть paper, glass, flat`);
  if (film.exit && ![...TRANSITIONS, 'fade'].includes(film.exit)) errors.push(`exit: ${film.exit}, есть ${[...TRANSITIONS, 'fade'].join(', ')}`);
  if (film.motion && !MOTION[film.motion]) errors.push(`motion: ${film.motion}, есть ${Object.keys(MOTION).join(', ')}`);
  return errors;
}

// ── DOM ───────────────────────────────────────────────────────────────────────
// Ниже — сборка элементов. Каждое слово возвращает items: {node, x, y, rot, t0, enter, tick?}.
// x, y — центр элемента в пикселях кадра; tick(u) — что меняется внутри после входа (u — секунды сцены).

const PALETTE_VARS = ['--signal', '--signal-2', '--positive', '--ink'];

function make(tag, cls, parent, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  if (parent) parent.appendChild(n);
  return n;
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

export async function mountBoard({box, film, W, H, readVar}) {
  const errors = validateFilm(film);
  if (errors.length) throw new Error('Сценарий board: ' + errors.join('; '));
  const motion = MOTION[film.motion ?? 'smooth'];
  const material = film.material ?? 'paper';
  const portrait = H > W;
  // крупно: в горизонтали элементы на треть больше (кадр шире, инфографика либо крупная, либо никакой)
  const U = (Math.min(W, H) / 1080) * (portrait ? 1 : 1.35) * (film.scale ?? 1);
  const safe = safeRect(W, H, film.safe);
  const palette = (film.palette?.length ? film.palette : PALETTE_VARS.map(readVar)).map((c) => c.trim());
  const caps = film.caps !== false;
  const tl = timeline(film.words);
  const kinds = film.words.map((w, i) => (i === 0 ? 'cut' : w.transition ?? film.transition ?? 'pan-up'));
  box.dataset.material = material;
  box.style.setProperty('--u', U);

  const scenes = tl.map((s, idx) => {
    const w = withPreset({...(film.defaults ?? {}), ...film.words[idx]});
    const el = make('section', 'bd-scene', box);
    const rand = rng(1009 * (idx + 1) + (film.seed ?? 7));
    const items = [];
    // своя рабочая зона у сцены (safe: [x, y, w, h] в долях кадра): доска поверх записи обходит лица, а они у каждого плана свои
    const ctx = makeCtx({el, w, items, rand, palette, U, W, H, portrait, safe: w.safe ? safeRect(W, H, w.safe) : safe, caps, material, motion, idx, dur: s.dur});
    if (w.head) ctx.head(w.head);
    // Составная сцена: with — ещё 1–2 слова рядом. Рабочая зона делится на колонки (в вертикали — на ряды),
    // главное слово получает большую часть, остальные встают следом с задержкой.
    const parts = [w, ...(w.with ?? []).map((x) => withPreset({...(film.defaults ?? {}), ...x}))];
    const zones = splitZone(ctx.safe, parts.length, portrait, w.split);
    parts.forEach((part, k) => {
      const key = k === 0 ? s.key : resolveWord(part.word);
      const sub = k === 0 && parts.length === 1 ? ctx : makeCtx({el, w: part, items, rand, palette, U: U * (parts.length > 1 ? (portrait ? 0.8 : 0.78) : 1), W, H, portrait, safe: zones[k], caps, material, motion, idx, dur: s.dur});
      const before = items.length;
      BUILD[key](sub, part);
      if (k > 0) for (const it of items.slice(before)) it.t0 += num(part.delay, 0.5 + 0.45 * k);
      if (k > 0 && part.label && !['icon', 'tag', 'pipeline'].includes(key)) sub.footLabel(part.label);
    });
    if (w.stamp && !w._stampInCard) ctx.stamp(w.stamp);
    if (w.label && !['icon', 'tag', 'pipeline'].includes(s.key)) ctx.footLabel(w.label);
    return {el, items, tl: s};
  });

  const tear = make('div', 'bd-tear', box);
  tear.style.clipPath = tornPolygon(3, 3, 6).replace('polygon(', 'polygon(');
  tear.style.background = palette[2] ?? palette[0];

  // Раскладка видимой сцены для проверки наложений (штамп на тексте, надпись на надписи, графика на лице под доской):
  // прямоугольники в пикселях кадра. Вызывать после hf-seek на момент, когда сцена собрана.
  if (typeof window !== 'undefined') window.__boardLayout = () => {
    const rootEl = box.closest('#root') ?? box;
    const rr = rootEl.getBoundingClientRect(), k = W / (rr.width || W);
    const rect = (n) => { const b = n.getBoundingClientRect(); return {x: (b.left - rr.left) * k, y: (b.top - rr.top) * k, w: b.width * k, h: b.height * k}; };
    const out = [];
    scenes.forEach((sc, si) => {
      if (sc.el.style.display === 'none') return;
      sc.items.forEach((it, ii) => {
        const n = it.node;
        if (Number(n.style.opacity || 1) < 0.5) return;
        const kind = n.classList.contains('bd-stamp') ? 'stamp' : n.classList.contains('bd-label') ? 'label' : 'item';
        out.push({scene: si, item: ii, kind, part: 'box', ...rect(n), text: n.textContent.trim().slice(0, 40)});
        if (kind === 'item') {
          n.querySelectorAll('.bd-text, .bd-docline').forEach((x) => { if (!x.closest('.bd-stamp')) out.push({scene: si, item: ii, kind, part: 'text', ...rect(x), text: x.textContent.trim().slice(0, 40)}); });
          n.querySelectorAll('.bd-stamp').forEach((x) => { if (Number(x.style.opacity || 1) >= 0.5) out.push({scene: si, item: ii, kind: 'stamp', part: 'box', ...rect(x), text: x.textContent.trim().slice(0, 40)}); });
        }
      });
    });
    return out;
  };

  return function render(t) {
    const cams = cameraAt(t, tl, {W, H, transition: motion.transition, kinds, exit: film.exit});
    scenes.forEach((sc, i) => {
      const cam = cams[i];
      sc.el.style.display = cam.visible ? 'block' : 'none';
      if (!cam.visible) return;
      sc.el.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})`;
      sc.el.style.filter = cam.blur > 0.1 ? `blur(${cam.blur}px)` : '';
      sc.el.style.opacity = cam.o;
      sc.el.style.setProperty('--dim', cam.dim);
      // первая сцена уже собрана на нулевом кадре (обложка и хук), дальше живёт как обычно
      const u = t - sc.tl.start + (i === 0 && film.hookAtZero !== false ? HOOK_LEAD : 0);
      for (const it of sc.items) {
        if (it.tick) it.tick(u - it.t0, u);
        const a = appear(u - it.t0, it.enter ?? 'pop', motion);
        const n = it.node;
        n.style.opacity = a.o;
        n.style.transform = `translate(-50%, -50%) translate(${it.x + a.x * U}px, ${it.y + a.y * U}px) rotate(${(it.rot ?? 0) + a.r}deg) scale(${a.s})`;
        if (a.lift) n.style.setProperty('--lift', a.lift.toFixed(3)); else n.style.removeProperty('--lift');
      }
    });
    const tr = tearAt(t, tl, {transition: motion.transition, kinds});
    tear.style.display = tr ? 'block' : 'none';
    if (tr) tear.style.transform = `translateX(${tr.x * W}px)`;
  };
}

// Общие детали сцены: карточка, текст, плитки букв, штамп, ярлык, скотч.
// Ширина строки в пикселях — по настоящему шрифту пака, а не на глаз (узкий и широкий шрифт отличаются вдвое).
const measureCanvas = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
function measureText(str, px, font = 'display') {
  const root = document.querySelector('[data-composition-id]');
  const cs = getComputedStyle(root);
  const family = cs.getPropertyValue(`--font-${font}`).trim() || 'sans-serif';
  const weight = font === 'display' ? cs.getPropertyValue('--w-display').trim() || '700' : font === 'mono' ? '500' : '600';
  measureCanvas.font = `${weight} ${px}px ${family}`;
  return measureCanvas.measureText(str).width;
}

function makeCtx(base) {
  const {el, items, rand, palette, U, W, H, portrait, caps, motion} = base;
  let safe = base.safe;
  let cx = safe.x + safe.w / 2, cy = safe.y + safe.h / 2;
  let order = 0;
  const ctx = {
    ...base, cx, cy,
    measure: (str, size, font = 'display', upper = caps && font === 'display') => measureText(upper ? String(str).toUpperCase() : String(str), size * U, font),
    // заголовок сцены забирает верх рабочей зоны: содержимое сдвигается ниже
    shrinkTop(px) { safe = {...safe, y: safe.y + px, h: safe.h - px}; ctx.safe = safe; cx = safe.x + safe.w / 2; cy = safe.y + safe.h / 2; ctx.cx = cx; ctx.cy = cy; },
    color: (i) => palette[((i % palette.length) + palette.length) % palette.length],
    // цвет для текста и плашек на бумаге: без светлого четвёртого цвета палитры
    accent: (i) => palette[((i % Math.min(3, palette.length)) + 3) % Math.min(3, palette.length)],
    nextT: (gap = motion.stagger) => (order++ === 0 ? 0.15 : 0.15 + (order - 1) * gap),
    item(node, x, y, opts = {}) {
      const it = {node, x, y, rot: opts.rot ?? 0, t0: opts.t0 ?? ctx.nextT(opts.gap), enter: opts.enter ?? 'pop', tick: opts.tick};
      items.push(it);
      return it;
    },
    // Карточка: бумага с рваным краем, стекло или плоская плашка — по материалу сцены.
    card({w, h, fill, tone = 'paper', tape = false, cls = ''}) {
      const outer = make('div', `bd-item bd-card bd-${tone} ${cls}`, el);
      outer.style.width = `${w}px`; outer.style.height = h ? `${h}px` : 'auto';
      const inner = make('div', 'bd-face', outer);
      if (base.material === 'paper') inner.style.clipPath = tornPolygon(Math.floor(rand() * 1e6), 1.1 * (300 / Math.max(160, w)), 18);
      if (fill) { inner.style.background = fill; inner.style.color = onColor(fill); outer.classList.add('bd-filled'); if (/^#/.test(fill) && luminance(fill) < 0.04) outer.classList.add('bd-dark'); }
      if (tape && base.material === 'paper') {
        for (const side of [-1, 1]) {
          const tp = make('div', 'bd-tape', outer);
          tp.style.left = side < 0 ? '-4%' : 'auto'; tp.style.right = side > 0 ? '-4%' : 'auto';
          tp.style.transform = `rotate(${side * 38}deg)`;
        }
      }
      return {outer, inner};
    },
    text(parent, s, {size = 80, font = 'display', color, cls = '', upper = caps && font === 'display', align} = {}) {
      const n = make('div', `bd-text bd-${font} ${cls}`, parent);
      n.textContent = upper ? String(s).toUpperCase() : s;
      // крупный текст масштабируется, служебный не мельче 28 px — порог чтения с телефона
      n.style.fontSize = `${font === 'display' ? size * U : Math.max(28, size * U)}px`;
      if (color) n.style.color = color;
      if (align) n.style.textAlign = align;
      return n;
    },
    // Буквы-вырезки: каждая буква на своей плитке своего цвета, встают по очереди.
    tiles(s, {x, y, size = 120, t0, gap = 0.06, colors}) {
      const chars = [...String(caps ? String(s).toUpperCase() : s)];
      const tw = size * 0.78 * U;
      const cw = (ch) => (ch === ' ' ? tw * 0.4 : Math.max(/[.,:]/.test(ch) ? tw * 0.42 : tw * 0.72, ctx.measure(ch, size * 0.9, 'display', false) + size * 0.22 * U));
      const total = chars.reduce((sum, ch) => sum + cw(ch) + 6 * U, -6 * U);
      let px = x - total / 2;
      const nodes = [];
      chars.forEach((ch, i) => {
        const wch = cw(ch);
        if (ch !== ' ') {
          const fill = colors ? colors[i % colors.length] : ctx.color(Math.floor(rand() * 9));
          const {outer, inner} = ctx.card({w: wch, h: size * 1.08 * U, fill, cls: 'bd-tile'});
          ctx.text(inner, ch, {size: size * 0.9, upper: false, color: onColor(fill)});
          nodes.push(ctx.item(outer, px + wch / 2, y + (rand() - 0.5) * 10 * U, {rot: (rand() - 0.5) * 9, t0: (t0 ?? 0.15) + i * gap, enter: 'pop'}));
        }
        px += wch + 6 * U;
      });
      // перезаписать буквы плиток строкой той же длины (пробелы плиток не имеют)
      const holders = nodes.map((it) => it.node.querySelector('.bd-text'));
      const slots = chars.map((ch, i) => (ch === ' ' ? -1 : i)).filter((i) => i >= 0);
      const set = (str) => { const a = [...str]; holders.forEach((h, k) => { h.textContent = a[slots[k]] ?? ''; }); };
      return {nodes, width: total, set};
    },
    // Слова в плашках по очереди (как у вырезанных заголовков); accent — индексы или слова цветом акцента.
    words(s, {x, y, size = 64, t0 = 0.15, gap = 0.1, accent = [], maxW}) {
      const list = String(s).split(/\s+/).filter(Boolean);
      const isAccent = (wd, i) => accent.includes(i) || accent.map(norm).includes(norm(wd));
      const lineW = maxW ?? safe.w;
      const ww = (wd) => ctx.measure(wd, size) + 30 * U;
      const lines = [[]];
      let acc = 0;
      for (const wd of list) {
        if (acc + ww(wd) > lineW && lines.at(-1).length) { lines.push([]); acc = 0; }
        lines.at(-1).push(wd); acc += ww(wd) + 10 * U;
      }
      let n = 0;
      lines.forEach((line, li) => {
        const total = line.reduce((sum, wd) => sum + ww(wd) + 10 * U, -10 * U);
        let px = x - total / 2;
        for (const wd of line) {
          const i = n++;
          const fill = isAccent(wd, i) ? ctx.color(0) : (i % 3 === 2 && base.material !== 'glass' ? '#2a2623' : 'var(--paper)');   // на стекле тёмная плашка теряется
          const {outer, inner} = ctx.card({w: ww(wd), h: size * 1.25 * U, fill: fill.startsWith('var') ? undefined : fill, tone: 'paper', cls: 'bd-word'});
          ctx.text(inner, wd, {size, color: fill.startsWith('var') ? 'var(--paper-ink)' : onColor(fill)});
          ctx.item(outer, px + ww(wd) / 2, y + (li - (lines.length - 1) / 2) * size * 1.45 * U, {rot: (rand() - 0.5) * 3, t0: t0 + i * gap, enter: 'pop'});
          px += ww(wd) + 10 * U;
        }
      });
      return n;
    },
    // Заголовок сцены сверху рабочей зоны.
    head(s) {
      const spec = typeof s === 'string' ? {text: s} : s;
      ctx.words(spec.text, {x: cx, y: safe.y + 40 * U, size: spec.size ?? (portrait ? 52 : 48), accent: spec.accent ?? [], t0: 0.1, gap: 0.08});
      ctx.shrinkTop(120 * U);
    },
    // Штамп поверх сцены: текст в двойной рамке, наклон, опускается из крупного.
    stamp(s) {
      const spec = typeof s === 'string' ? {text: s} : s;
      const n = make('div', `bd-item bd-stamp ${spec.tone === 'good' ? 'bd-good' : ''}`, el);
      ctx.text(n, spec.text, {size: spec.size ?? 46});
      const x = spec.x !== undefined ? safe.x + spec.x * safe.w : cx + (portrait ? 0 : safe.w * 0.22);
      const y = spec.y !== undefined ? safe.y + spec.y * safe.h : safe.y + safe.h * 0.86;
      ctx.item(n, x, y, {rot: spec.rot ?? -6, t0: spec.at ?? 1.6, enter: 'stamp'});
    },
    // Ярлык машинописью на полоске бумаги.
    label(s, x, y, opts = {}) {
      const n = make('div', 'bd-item bd-label', el);
      ctx.text(n, s, {size: opts.size ?? 30, font: 'mono'});
      return ctx.item(n, x, y, {rot: opts.rot ?? (rand() - 0.5) * 3, t0: opts.t0, enter: opts.enter ?? 'rise'});
    },
    footLabel(s) { ctx.label(s, cx, safe.y + safe.h - 50 * U, {t0: 1.1}); },
    icon(name, size, colors = {}) {
      const key = ICONS[name] ? name : ICON_ALIASES[norm(name)];
      if (!key) throw new Error(`Нет значка «${name}»`);
      const c = {a: colors.a ?? ctx.color(0), b: colors.b ?? ctx.color(1), c: colors.c ?? ctx.color(2), ink: '#151413', paper: 'var(--paper)', dark: '#2a2725'};
      const n = make('div', 'bd-item bd-icon', el, `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${ICONS[key](c)}</svg>`);
      n.style.width = n.style.height = `${size}px`;
      return n;
    },
    // Картинка или своя заглушка: цветной кадр со значком — когда своего снимка нет.
    picture(parent, src, {fill, iconName = 'play'} = {}) {
      if (src) { const img = make('img', 'bd-img', parent); img.src = src; return img; }
      const ph = make('div', 'bd-ph', parent);
      ph.style.background = `linear-gradient(135deg, ${fill ?? ctx.color(Math.floor(rand() * 4))}, #1d1b1a 140%)`;
      const key = ICONS[iconName] ? iconName : ICON_ALIASES[norm(iconName)] ?? 'play';
      ph.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">${ICONS[key]({a: 'rgba(255,255,255,.88)', b: 'rgba(0,0,0,.25)', c: 'rgba(255,255,255,.5)', ink: '#151413', paper: '#fff', dark: 'rgba(0,0,0,.35)'})}</svg>`;
      return ph;
    },
    // Раскладка: в горизонтали — в ряд, в вертикали — столбиком; возвращает центры.
    spread(n, {along = portrait ? 'y' : 'x', span = 0.8, at = 0.5} = {}) {
      const safe = ctx.safe;
      return Array.from({length: n}, (_, i) => {
        const k = n === 1 ? 0.5 : i / (n - 1);
        if (along === 'x') return {x: safe.x + safe.w * (0.5 - span / 2 + k * span), y: safe.y + safe.h * at};
        return {x: safe.x + safe.w * at, y: safe.y + safe.h * (0.5 - span / 2 + k * span)};
      });
    },
  };
  return ctx;
}

const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const money = (w, v) => `${w.prefix ?? ''}${formatNumber(v, {decimals: w.decimals ?? 0, sep: w.sep ?? ','})}${w.suffix ?? ''}`;

// ── слова: как собирается каждая сцена ─────────────────────────────────────────
const BUILD = {
  // ТЕКСТ
  headline(c, w) {
    c.words(w.text, {x: c.cx, y: c.cy, size: w.size ?? (c.portrait ? 124 : 104), accent: w.accent ?? [], gap: w.gap ?? 0.14, maxW: c.safe.w * 0.95});
  },
  ransom(c, w) {
    const len = [...String(w.text)].length;
    const size = Math.min(w.size ?? 210, (w.size ?? 210) * c.safe.w * 0.9 / Math.max(1, c.measure(w.text, w.size ?? 210) + len * 50 * c.U));
    c.tiles(w.text, {x: c.cx, y: c.cy, size, gap: w.gap ?? 0.07});
    if (w.icon) c.item(c.icon('burst', 160 * c.U, {a: c.color(1)}), c.cx + c.safe.w * 0.38, c.cy - 150 * c.U, {t0: 0.7});
  },
  tag(c, w) {
    const {outer, inner} = c.card({w: Math.min(c.safe.w * 0.9, c.measure(w.text, w.size ?? 120, 'display', false) + 200 * c.U), h: 190 * c.U, fill: w.color ?? c.color(0), cls: 'bd-tagcard'});
    make('div', 'bd-hole', inner);
    c.text(inner, w.text, {size: w.size ?? 120, upper: false, font: 'display'});
    c.item(outer, c.cx, c.cy, {rot: -4, enter: 'drop'});
    if (w.label) c.label(w.label, c.cx, c.cy + 170 * c.U, {t0: 0.8});
  },
  card(c, w) {
    const {outer, inner} = c.card({w: Math.min(c.safe.w * 0.86, (w.w ?? 0.5) * c.W), fill: w.color, tape: w.tape ?? true, cls: 'bd-note'});
    if (w.kicker) c.text(inner, w.kicker, {size: 28, font: 'mono', cls: 'bd-kicker'});
    if (w.icon) inner.appendChild(Object.assign(c.icon(w.icon, 140 * c.U), {className: 'bd-icon bd-inline'}));
    c.text(inner, w.title ?? w.text, {size: w.size ?? 110, cls: 'bd-title'});
    if (w.body) c.text(inner, w.body, {size: 34, font: 'mono', cls: 'bd-body'});
    c.item(outer, c.cx, c.cy, {rot: w.rot ?? -2, enter: 'drop'});
  },
  strike(c, w) {
    const {outer, inner} = c.card({w: Math.min(c.safe.w * 0.8, 820 * c.U), tape: true, cls: 'bd-note bd-lined'});
    if (w.kicker) c.text(inner, w.kicker, {size: 28, font: 'mono', cls: 'bd-kicker'});
    const t = c.text(inner, w.from, {size: w.size ?? 120, cls: 'bd-title bd-strike'});
    const line = make('div', 'bd-strikeline', t);
    c.item(outer, c.cx, c.cy - (w.to ? 60 * c.U : 0), {rot: -2, enter: 'drop', tick: (u) => { line.style.transform = `scaleX(${power3Out(invLerp(0.9, 1.4, u))})`; }});
    if (w.to) {
      const n = make('div', 'bd-item bd-stamp bd-good', c.el);
      c.text(n, w.to, {size: 64});
      c.item(n, c.cx + (c.portrait ? 0 : 60 * c.U), c.cy + 200 * c.U, {rot: -5, t0: 1.6, enter: 'stamp'});
    }
  },
  highlight(c, w) {
    const lines = w.lines ?? [];
    const {outer, inner} = c.card({w: Math.min(c.safe.w * 0.9, 1000 * c.U), cls: 'bd-doc'});
    if (w.kicker) c.text(inner, w.kicker, {size: 28, font: 'mono', cls: 'bd-kicker'});
    const marks = [];
    lines.forEach((ln) => {
      const row = make('div', 'bd-docline', inner);
      String(ln).split(/(\[[^\]]+\])/).forEach((part) => {
        if (!part) return;
        const m = /^\[(.+)\]$/.exec(part);
        const span = make('span', m ? 'bd-mark' : '', row);
        span.textContent = m ? m[1] : part;
        if (m) marks.push(span);
      });
      row.style.fontSize = `${(w.size ?? 40) * c.U}px`;
    });
    // штамп — часть листа: висит под нижним краем справа и едет вместе с листом, на строки не ложится при любом переносе
    let st = null;
    const spec = w.stamp && (typeof w.stamp === 'string' ? {text: w.stamp} : w.stamp);
    if (spec && spec.x === undefined && spec.y === undefined) {
      st = make('div', `bd-stamp bd-stamp-under ${spec.tone === 'good' ? 'bd-good' : ''}`, outer);
      c.text(st, spec.text, {size: spec.size ?? 46});
      w._stampInCard = true;
    }
    const st0 = spec?.at ?? 1.6;
    c.item(outer, c.cx, c.cy, {rot: 1.5, enter: 'drop', tick: (u) => {
      marks.forEach((m, i) => m.style.setProperty('--k', power3Out(invLerp(0.8 + i * 0.6, 1.3 + i * 0.6, u)).toFixed(3)));
      if (st) { const a = appear(u - st0, 'stamp', c.motion); st.style.opacity = a.o; st.style.transform = `rotate(${(spec.rot ?? -6) + a.r}deg) scale(${a.s})`; }
    }});
  },
  bubble(c, w) {
    const list = w.items ?? [w.text];
    list.forEach((s, i) => {
      const {outer, inner} = c.card({w: Math.min(c.safe.w * 0.86, c.measure(s, 50) + 90 * c.U), fill: c.color(i), cls: `bd-bubble ${i % 2 ? 'bd-right' : ''}`});
      c.text(inner, s, {size: 50});
      const side = c.portrait ? 0 : (i % 2 ? 1 : -1) * c.safe.w * 0.12;
      c.item(outer, c.cx + side, c.cy + (i - (list.length - 1) / 2) * 150 * c.U, {rot: (i % 2 ? 2 : -2), t0: 0.2 + i * 0.5, enter: 'pop'});
    });
  },

  // ЧИСЛА
  counter(c, w) {
    const style = w.style ?? 'tape';
    const stops = w.values ?? [w.from ?? 0, w.to ?? 100];
    const final = money(w, stops.at(-1));
    const size = Math.min(w.size ?? 170, (w.size ?? 170) * (c.safe.w * 0.9) / Math.max(1, c.measure(final, w.size ?? 170) + (style === 'tiles' ? final.length * 40 * c.U : 120 * c.U)));
    if (style === 'tiles') {
      // цифры на плитках: плитки встают сразу на длину итога, цифры бегут внутри
      const {nodes, set} = c.tiles(final, {x: c.cx, y: c.cy, size, gap: 0.05});
      nodes[0].tick = (u) => set(money(w, countAt(u - 0.3, w.secs ?? 1.6, stops)).padStart(final.length, '0'));
    } else {
      const {outer, inner} = c.card({w: Math.min(c.safe.w, c.measure(final, size) + 120 * c.U), fill: style === 'tape' ? (w.color ?? c.color(1)) : undefined, cls: 'bd-tapecard'});
      const t = c.text(inner, final, {size, cls: 'bd-num'});
      c.item(outer, c.cx, c.cy, {rot: -1.5, enter: 'pop', tick: (u) => { t.textContent = money(w, countAt(u - 0.25, w.secs ?? 1.6, stops)); }});
    }
    if (w.caption) c.label(w.caption, c.cx, c.cy + size * 0.95 * c.U + 34 * c.U, {t0: 0.9});
  },
  cheque(c, w) {
    const cw = Math.min(c.safe.w * 0.92, 1180 * c.U);
    const {outer, inner} = c.card({w: cw, fill: w.color ?? '#BFE3C6', cls: 'bd-cheque'});
    c.text(inner, w.kicker ?? 'PAY TO THE ORDER OF', {size: 28, font: 'mono', cls: 'bd-kicker'});
    const payee = c.text(inner, '', {size: 72, cls: 'bd-payee'});
    c.text(inner, w.amountLabel ?? 'AMOUNT', {size: 28, font: 'mono', cls: 'bd-kicker'});
    const row = make('div', 'bd-amountrow', inner);
    const box = make('div', 'bd-amount', row);
    const amt = c.text(box, money(w, (w.values ?? [0]).at(-1)), {size: 96, cls: 'bd-num'});
    if (w.suffixText) c.text(row, w.suffixText, {size: 44});
    const to = String(w.to ?? '');
    c.item(outer, c.cx, c.cy, {rot: -1, enter: 'slide-r', tick: (u) => {
      payee.textContent = (caps(c) ? to.toUpperCase() : to).slice(0, Math.floor(Math.max(0, u - 0.3) * 22));
      amt.textContent = money(w, countAt(u - 0.4 - to.length / 22, w.secs ?? 1.8, w.values ?? [0, 100]));
    }});
  },
  receipt(c, w) {
    const rows = w.rows ?? [];
    const {outer, inner} = c.card({w: Math.min(c.safe.w * 0.7, 760 * c.U), cls: 'bd-receipt'});
    if (w.title) c.text(inner, w.title, {size: 30, font: 'mono', cls: 'bd-kicker bd-center'});
    const lines = rows.map((r) => {
      const ln = make('div', `bd-rline ${r.bad ? 'bd-bad' : ''}`, inner);
      c.text(ln, r.label, {size: 30, font: 'mono', upper: false});
      c.text(ln, r.value, {size: 30, font: 'mono', upper: false});
      return ln;
    });
    const tot = make('div', 'bd-rtotal', inner);
    c.text(tot, w.totalLabel ?? 'TOTAL', {size: 54});
    const tv = c.text(tot, money(w, w.total ?? 0), {size: 64, cls: 'bd-num'});
    c.item(outer, c.cx, c.cy, {enter: 'rise', tick: (u) => {
      lines.forEach((ln, i) => { ln.style.opacity = invLerp(0.4 + i * 0.45, 0.6 + i * 0.45, u); });
      const t0 = 0.6 + rows.length * 0.45;
      tot.style.opacity = invLerp(t0, t0 + 0.2, u);
      tv.textContent = money(w, countAt(u - t0, 1.1, [0, w.total ?? 0]));
    }});
  },
  equation(c, w) {
    const terms = w.terms ?? ['A', '÷', 'B', '=', 'C'];
    const pos = c.spread(terms.length, {along: c.portrait ? 'y' : 'x', span: c.portrait ? 0.84 : 0.74});
    const resultText = w.result !== undefined ? money(w, w.result) : String(terms.at(-1));
    terms.forEach((term, i) => {
      const isOp = /^[÷×+−\-=]$/.test(term);
      const last = i === terms.length - 1;
      if (isOp) {
        const n = make('div', 'bd-item bd-op', c.el);
        c.text(n, term, {size: 120});
        c.item(n, pos[i].x, pos[i].y, {t0: 0.2 + i * 0.35});
        return;
      }
      const shown = last ? resultText : String(term);
      const {outer, inner} = c.card({w: Math.min(c.safe.w * (c.portrait ? 0.9 : 0.3), c.measure(shown, last ? 92 : 76) + 130 * c.U), fill: last ? c.color(1) : undefined, cls: 'bd-eqterm'});
      const t = c.text(inner, term, {size: last ? 92 : 76, cls: 'bd-num'});
      const tick = last && w.result !== undefined ? (u) => { t.textContent = money(w, countAt(u, 1.2, [0, w.result])); } : undefined;
      c.item(outer, pos[i].x, pos[i].y, {rot: (i % 2 ? 1.5 : -1.5), t0: 0.2 + i * 0.35, enter: last ? 'drop' : 'pop', tick});
    });
  },
  timer(c, w) {
    const {x: ix, y: iy} = c.portrait ? {x: c.cx, y: c.cy - 170 * c.U} : {x: c.cx - c.safe.w * 0.18, y: c.cy};
    const dial = c.icon('stopwatch', 360 * c.U, {a: c.color(1), b: 'var(--paper)', c: c.color(0)});
    const hand = make('div', 'bd-hand', dial);
    c.item(dial, ix, iy, {tick: (u) => { hand.style.transform = `translate(-50%, -100%) rotate(${clamp(u / (w.secs ?? 2)) * 360 * (w.turns ?? 1)}deg)`; }});
    const to = num(w.seconds, 30);
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const {nodes, set} = c.tiles(fmt(to), {x: c.portrait ? c.cx : c.cx + c.safe.w * 0.2, y: c.portrait ? c.cy + 190 * c.U : c.cy, size: 150, t0: 0.4});
    nodes[0].tick = (u) => set(fmt(countAt(u, w.secs ?? 2, [0, to])).padStart(fmt(to).length, '0'));
  },
  calendar(c, w) {
    const values = w.values ?? [1, 10];
    const {outer, inner} = c.card({w: 380 * c.U, h: 420 * c.U, cls: 'bd-cal'});
    const band = make('div', 'bd-calband', inner);
    band.style.background = w.color ?? c.color(0);
    c.text(band, w.kicker ?? '', {size: 34});
    const big = c.text(inner, String(values[0]), {size: 200, cls: 'bd-num'});
    if (w.unit) c.text(inner, w.unit, {size: 52});
    const numeric = values.length === 2 && values.every((v) => typeof v === 'number');
    c.item(outer, c.cx, c.cy, {rot: 2, enter: 'drop', tick: (u) => {
      if (numeric) { big.textContent = String(Math.round(countAt(u - 0.6, w.secs ?? 1.4, values))); return; }
      const k = clamp((u - 0.6) / (w.secs ?? 1.4));
      big.textContent = String(values[Math.min(values.length - 1, Math.floor(k * values.length))]);
    }});
  },

  // СРАВНЕНИЕ
  scale(c, w) {
    const beamW = Math.min(c.safe.w * 0.86, 1100 * c.U);
    const rig = make('div', 'bd-item bd-scale', c.el);
    rig.style.width = `${beamW}px`; rig.style.height = `${beamW * 0.55}px`;
    const beam = make('div', 'bd-beam', rig);
    const post = make('div', 'bd-post', rig);
    const pads = [w.left, w.right].map((side, i) => {
      const pad = make('div', `bd-pad ${i ? 'bd-r' : 'bd-l'}`, beam);
      const spec = typeof side === 'string' ? {text: side} : side ?? {};
      if (spec.icon) pad.appendChild(Object.assign(c.icon(spec.icon, beamW * 0.18), {className: 'bd-icon bd-inline'}));
      if (spec.text) c.text(pad, spec.text, {size: 44, cls: 'bd-padtext'});
      return pad;
    });
    const tilt = num(w.tilt, 12) * (w.heavy === 'left' ? -1 : 1);
    void post; void pads;
    c.item(rig, c.cx, c.cy + 30 * c.U, {enter: 'rise', tick: (u) => {
      const a = tilt * power3Out(invLerp(0.6, 1.6, u)) + Math.sin(u * 3) * 0.6 * invLerp(1.6, 2.2, u);
      beam.style.transform = `rotate(${a}deg)`;
      beam.style.setProperty('--counter', `${-a}deg`);
    }});
  },
  bars(c, w) {
    const list = w.items ?? [];
    const max = Math.max(...list.map((b) => num(b.value, 1)));
    const area = {w: Math.min(c.safe.w * 0.86, 1100 * c.U), h: c.safe.h * (c.portrait ? 0.62 : 0.66)};
    const wrap = make('div', 'bd-item bd-bars', c.el);
    wrap.style.width = `${area.w}px`; wrap.style.height = `${area.h}px`;
    const bars = list.map((b, i) => {
      const col = make('div', 'bd-barcol', wrap);
      const bar = make('div', 'bd-bar', col);
      bar.style.background = b.color ?? c.color(i);
      const val = c.text(bar, '', {size: 46, cls: 'bd-num bd-barval'});
      c.text(col, b.label, {size: 28, font: 'mono', cls: 'bd-barlabel'});
      return {bar, val, k: num(b.value, 0) / max, b};
    });
    const best = list.findIndex((b) => b.best);
    let ring;
    if (best >= 0) { ring = make('div', 'bd-ring', bars[best].bar); }
    c.item(wrap, c.cx, c.cy + 20 * c.U, {enter: 'fade', tick: (u) => {
      bars.forEach(({bar, val, k, b}, i) => {
        const e = power3Out(invLerp(0.3 + i * 0.3, 1.0 + i * 0.3, u));
        bar.style.height = `${e * k * 100}%`;
        val.textContent = b.show === false ? '' : money(w, Math.round(num(b.value) * e));
      });
      if (ring) ring.style.setProperty('--k', power3Out(invLerp(1.2 + list.length * 0.3, 1.8 + list.length * 0.3, u)).toFixed(3));
    }});
  },
  sizes(c, w) {
    const list = w.items ?? [];
    const szOf = (s, i) => (s.size ?? (i ? 1 : 0.45)) * (c.portrait ? 420 : 460) * c.U;
    // в вертикали предметы стопкой: нижний вместе с подписью остаётся в рабочей зоне
    const big = Math.max(0, ...list.map(szOf));
    const pos = c.spread(list.length, {span: c.portrait ? Math.max(0.3, Math.min(0.62, (c.safe.h - big * 1.1 - 110 * c.U) / c.safe.h)) : 0.6});
    list.forEach((s, i) => {
      const sz = szOf(s, i);
      const n = c.icon(s.icon ?? 'piggy', sz, {a: c.color(i ? 2 : 0)});
      c.item(n, pos[i].x, pos[i].y, {t0: 0.2 + i * 0.7, enter: 'pop'});
      if (s.label) c.label(s.label, pos[i].x, pos[i].y + sz * 0.55 + 20 * c.U, {t0: 0.45 + i * 0.7});
    });
  },
  jar(c, w) {
    const jw = (c.portrait ? 300 : 360) * c.U, jh = (c.portrait ? 400 : 480) * c.U;
    const jar = make('div', 'bd-item bd-jar', c.el);
    jar.style.width = `${jw}px`; jar.style.height = `${jh}px`;
    make('div', 'bd-lid', jar);
    const glass = make('div', 'bd-glass', jar);
    const fill = make('div', 'bd-fill', glass);
    fill.style.background = w.color ?? c.color(2);
    const maxLine = make('div', 'bd-maxline', glass);
    maxLine.style.bottom = `${num(w.max, 0.8) * 100}%`;
    const maxTag = make('div', 'bd-maxtag', jar);
    maxTag.style.bottom = `calc(${num(w.max, 0.8) * 93}% - ${18 * c.U}px)`;
    c.text(maxTag, w.maxLabel ?? 'MAX', {size: 28});
    const jx = c.portrait ? c.cx : c.cx - c.safe.w * 0.15;
    c.item(jar, jx, c.portrait ? c.cy - 130 * c.U : c.cy, {enter: 'rise', tick: (u) => { fill.style.height = `${power3Out(invLerp(0.5, 0.5 + (w.secs ?? 1.8), u)) * num(w.level, 0.8) * 100}%`; }});
    if (w.value !== undefined) {
      const {outer, inner} = c.card({w: 360 * c.U, fill: c.color(1)});
      const t = c.text(inner, '', {size: 90, cls: 'bd-num'});
      c.item(outer, c.portrait ? c.cx : c.cx + c.safe.w * 0.22, c.portrait ? c.cy + 190 * c.U : c.cy, {t0: 0.8, tick: (u) => { t.textContent = money(w, countAt(u, w.secs ?? 1.5, [0, w.value])); }});
      if (w.caption) c.label(w.caption, c.portrait ? c.cx : c.cx + c.safe.w * 0.22, (c.portrait ? c.cy + 190 * c.U : c.cy) + 90 * c.U, {t0: 1.2});
    }
  },
  stack(c, w) {
    const n = Math.max(2, Math.min(14, num(w.count, 8)));
    const sx = c.portrait ? c.cx : c.cx - c.safe.w * 0.2;
    const base = c.cy + 160 * c.U;
    for (let i = 0; i < n; i++) {
      const {outer, inner} = c.card({w: 300 * c.U, h: 110 * c.U, fill: w.color ?? c.color(2), cls: 'bd-stackcard'});
      if (w.icon) inner.appendChild(Object.assign(c.icon(w.icon, 90 * c.U), {className: 'bd-icon bd-inline'}));
      c.item(outer, sx + (c.rand() - 0.5) * 18 * c.U, base - i * 30 * c.U, {rot: (c.rand() - 0.5) * 7, t0: 0.2 + i * 0.12, enter: 'drop'});
    }
    if (w.value !== undefined) {
      const fake = {...w, style: w.style ?? 'tiles'};
      const sub = {...c, cx: c.portrait ? c.cx : c.cx + c.safe.w * 0.2, cy: c.portrait ? c.cy - 220 * c.U : c.cy};
      BUILD.counter(sub, {...fake, values: [0, w.value], size: 110});
    }
  },
  fix(c, w) {
    const pos = c.spread(2, {span: c.portrait ? 0.56 : 0.58});
    const sides = [w.before ?? {}, w.after ?? {}];
    sides.forEach((s, i) => {
      const {outer, inner} = c.card({w: (c.portrait ? 300 : 380) * c.U, h: (c.portrait ? 360 : 480) * c.U, cls: 'bd-shot'});
      c.picture(inner, s.src, {iconName: s.icon ?? (i ? 'check' : 'warning')});
      if (!i) make('div', 'bd-ringbad', inner);
      c.item(outer, pos[i].x, pos[i].y, {rot: i ? 2 : -2, t0: 0.2 + i * 1.0, enter: i ? 'slide-r' : 'pop'});
      if (s.label) c.label(s.label, pos[i].x, pos[i].y + (c.portrait ? 210 : 270) * c.U, {t0: 0.5 + i * 1.0});
    });
    const arrow = make('div', 'bd-item bd-arrow', c.el);
    arrow.style.background = c.color(0);
    arrow.style.width = `${200 * c.U}px`; arrow.style.height = `${110 * c.U}px`;
    c.item(arrow, c.cx, c.cy, {t0: 0.9, rot: c.portrait ? 90 : 0, enter: 'slide'});
    const n = make('div', 'bd-item bd-stamp bd-good', c.el);
    c.text(n, w.after?.stamp ?? 'FIXED', {size: 52});
    c.item(n, pos[1].x, pos[1].y + (c.portrait ? 120 : 160) * c.U, {rot: -6, t0: 1.8, enter: 'stamp'});
  },

  // ПРОЦЕСС
  step(c, w) {
    const total = w.of ?? 5;
    c.label(`${w.kickerText ?? 'step'} ${w.n} ${w.ofText ?? 'of'} ${total}`, c.cx, c.cy - 230 * c.U, {t0: 0.1, enter: 'pop'});
    const {outer, inner} = c.card({w: 260 * c.U, h: 300 * c.U, fill: w.color ?? c.color(w.n - 1)});
    c.text(inner, String(w.n), {size: 240, cls: 'bd-num'});
    const ix = c.portrait ? c.cx : c.cx - (w.icon ? 110 * c.U : 0);
    c.item(outer, ix, c.cy, {rot: -3, enter: 'drop'});
    if (w.icon) c.item(c.icon(w.icon, 190 * c.U), ix + (c.portrait ? 0 : 260 * c.U), c.cy + (c.portrait ? -10 : 0), {t0: 0.6});
    if (w.title) c.words(w.title, {x: c.cx, y: c.cy + 250 * c.U, size: 64, accent: w.accent ?? [-1, String(w.title).split(/\s+/).length - 1], t0: 0.8});
  },
  pipeline(c, w) {
    const outs = num(w.outputs, 3);
    const W2 = c.portrait;
    const inPos = W2 ? {x: c.cx, y: c.safe.y + c.safe.h * 0.18} : {x: c.safe.x + c.safe.w * 0.1, y: c.cy};
    const gPos = {x: c.cx, y: c.cy};
    const outPos = W2 ? {x: c.cx, y: c.safe.y + c.safe.h * 0.82} : {x: c.safe.x + c.safe.w * 0.88, y: c.cy};
    const {outer, inner} = c.card({w: 300 * c.U, h: 220 * c.U, cls: 'bd-shot'});
    c.picture(inner, w.input?.src, {iconName: w.input?.icon ?? 'camera'});
    c.item(outer, inPos.x, inPos.y, {rot: -2, enter: 'slide'});
    if (w.input?.label) c.label(w.input.label, inPos.x, inPos.y + 140 * c.U, {t0: 0.4});
    // соединения — пунктир из залитых штрихов, растёт от входа к шестерне и от шестерни к выходу
    const link = (a, b, t0) => {
      const n = make('div', 'bd-item bd-dash', c.el);
      const len = Math.hypot(b.x - a.x, b.y - a.y) - (W2 ? 360 : 300) * c.U;
      n.style.width = `${Math.max(40, len)}px`;
      const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      c.item(n, (a.x + b.x) / 2, (a.y + b.y) / 2, {rot: ang, t0, enter: 'fade', tick: (u) => { n.style.setProperty('--k', power3Out(invLerp(0, 0.5, u)).toFixed(3)); }});
    };
    link(inPos, gPos, 0.5);
    const gear = c.icon('gear', 230 * c.U, {a: c.color(0)});
    c.item(gear, gPos.x, gPos.y, {t0: 0.7, tick: (u) => { gear.querySelector('svg').style.transform = `rotate(${u * 90}deg)`; }});
    if (w.label) c.label(w.label, gPos.x, gPos.y + 160 * c.U, {t0: 0.9});
    link(gPos, outPos, 1.2);
    for (let i = 0; i < outs; i++) {
      const {outer: o, inner: oi} = c.card({w: (W2 ? 170 : 150) * c.U, h: (W2 ? 230 : 220) * c.U, cls: 'bd-shot'});
      c.picture(oi, w.outputs_src?.[i], {iconName: w.output?.icon ?? 'play', fill: c.color(i + 1)});
      const off = (i - (outs - 1) / 2) * (W2 ? 190 : 170) * c.U;
      c.item(o, outPos.x + (W2 ? off : off * 0.3), outPos.y + (W2 ? 0 : off * 0.0) + (W2 ? 0 : (i - (outs - 1) / 2) * 30 * c.U), {rot: (i - 1) * 4, t0: 1.6 + i * 0.18, enter: 'pop'});
    }
    if (w.output?.label) c.label(w.output.label, outPos.x, outPos.y + 160 * c.U, {t0: 2.1});
  },
  terminal(c, w) {
    const tw = Math.min(c.safe.w * 0.95, 1240 * c.U);
    const win = make('div', 'bd-item bd-term', c.el);
    win.style.width = `${tw}px`;
    const bar = make('div', 'bd-termbar', win);
    for (let i = 0; i < 3; i++) make('i', '', bar);
    if (w.title) c.text(win, w.title, {size: 34, upper: false, cls: 'bd-termtitle'});
    const prompt = make('div', 'bd-prompt', win);
    prompt.style.fontSize = `${(w.size ?? 34) * c.U}px`;
    const caret = '<b class="bd-caret"></b>';
    const plan = make('div', 'bd-plan', win);
    const lines = (w.plan ?? []).map((s) => { const l = make('div', 'bd-planline', plan); l.textContent = s; l.style.fontSize = `${28 * c.U}px`; return l; });
    if (c.material === 'paper') for (const k of ['tl', 'tr', 'bl', 'br']) make('div', `bd-tape bd-${k}`, win);
    const text = String(w.prompt ?? '');
    // печать ускоряется, если иначе строки плана не успеют постоять до конца сцены
    const cps = Math.max(w.cps ?? 30, text.length / Math.max(1, c.dur - 2.4 - lines.length * 0.3));
    c.item(win, c.cx, c.cy, {enter: 'pop', tick: (u) => {
      const shown = typeAt(text, u - 0.5, cps);
      prompt.innerHTML = `<span class="bd-gt">&gt;</span> ${esc(shown)}${caret}`;
      const t0 = 0.6 + text.length / cps;
      lines.forEach((l, i) => { l.style.opacity = invLerp(t0 + i * 0.3, t0 + i * 0.3 + 0.15, u); });
    }});
  },
  progress(c, w) {
    const win = make('div', 'bd-item bd-term bd-progress', c.el);
    win.style.width = `${Math.min(c.safe.w * 0.8, 820 * c.U)}px`;
    const bar = make('div', 'bd-termbar', win);
    for (let i = 0; i < 3; i++) make('i', '', bar);
    if (w.title) c.text(win, w.title, {size: 30, font: 'mono', upper: false});
    const track = make('div', 'bd-track', win);
    const fill = make('div', 'bd-trackfill', track);
    fill.style.background = c.color(2);
    const val = c.text(win, '', {size: 40, font: 'mono', upper: false});
    c.item(win, c.cx, c.cy, {enter: 'pop', tick: (u) => {
      const k = power2InOut(invLerp(0.4, 0.4 + (w.secs ?? 2), u));
      fill.style.width = `${k * 100}%`;
      val.textContent = `${formatNumber(num(w.to, 100) * k, {decimals: w.decimals ?? 1})} ${w.unit ?? ''}`;
    }});
  },
  wave(c, w) {
    const n = num(w.bars, 64);
    const win = make('div', 'bd-item bd-term bd-wave', c.el);
    win.style.width = `${Math.min(c.safe.w * 0.92, 1200 * c.U)}px`;
    win.style.height = `${(c.portrait ? 360 : 400) * c.U}px`;
    const row = make('div', 'bd-waverow', win);
    const r = rng(w.seed ?? 5);
    const peaks = (w.peaks ?? [0.62]).map(Number);
    const bars = Array.from({length: n}, (_, i) => {
      const b = make('div', 'bd-wavebar', row);
      const x = i / (n - 1);
      const h = 0.18 + 0.4 * r() + peaks.reduce((s, p) => s + 0.6 * Math.exp(-((x - p) ** 2) / 0.002), 0);
      b.dataset.h = String(Math.min(1, h));
      return b;
    });
    if (w.caption) c.text(win, w.caption, {size: 28, font: 'mono', cls: 'bd-wavecap'});
    c.item(win, c.cx, c.cy, {enter: 'pop', tick: (u) => {
      const head = invLerp(0.3, 0.3 + (w.secs ?? 2), u);
      bars.forEach((b, i) => {
        const k = clamp((head * n - i) / 3);
        b.style.height = `${Number(b.dataset.h) * power3Out(k) * 100}%`;
        b.classList.toggle('bd-peak', peaks.some((p) => Math.abs(i / (n - 1) - p) < 0.03) && u > 0.3 + (w.secs ?? 2));
      });
    }});
  },
  signals(c, w) {
    const rows = w.rows ?? ['A', 'B', 'C'];
    const peak = num(w.peak, 0.6);
    const wd = Math.min(c.safe.w * 0.92, 1240 * c.U), ht = (c.portrait ? 170 : 150) * c.U;
    const box = make('div', 'bd-item bd-signals', c.el);
    box.style.width = `${wd}px`;
    const N = 80;
    const paths = rows.map((name, ri) => {
      const r = rng(31 + ri);
      const pts = Array.from({length: N}, (_, i) => {
        const x = i / (N - 1);
        const y = 0.5 + (r() - 0.5) * 0.35 - 0.45 * Math.exp(-((x - peak) ** 2) / 0.0025);
        return [x * 1000, y * 100];
      });
      const row = make('div', 'bd-sigrow', box);
      row.style.height = `${ht}px`;
      c.text(row, name, {size: 28, font: 'mono', cls: 'bd-signame'});
      // линия как залитая лента: верхний край + нижний край на 5 единиц ниже
      const top = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
      const bot = pts.slice().reverse().map(([x, y]) => `${x.toFixed(1)},${(y + 12).toFixed(1)}`).join(' ');
      const col = c.accent(ri);
      // залитая площадь под кривой и плотная лента по верху — без тонких линий
      row.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 1000 110" preserveAspectRatio="none"><polygon points="0,110 ${top} 1000,110" fill="${col}" opacity=".28"/><polygon points="${top} ${bot}" fill="${col}"/></svg>`);
      return row.querySelector('svg');
    });
    const win = make('div', 'bd-sigwin', box);
    win.style.left = `${(peak - 0.05) * 100}%`;
    c.item(box, c.cx, c.cy, {enter: 'fade', tick: (u) => {
      const k = power2InOut(invLerp(0.2, 1.8, u));
      paths.forEach((p) => { p.style.clipPath = `inset(0 ${(1 - k) * 100}% 0 0)`; });
      win.style.opacity = invLerp(1.9, 2.2, u);
    }});
  },
  filmstrip(c, w) {
    const frames = num(w.frames, 9);
    const wd = Math.min(c.safe.w * 0.98, 1500 * c.U);
    const strip = make('div', 'bd-item bd-strip', c.el);
    strip.style.width = `${wd}px`;
    for (let i = 0; i < frames; i++) {
      const f = make('div', 'bd-frame', strip);
      c.picture(f, w.srcs?.[i], {iconName: 'play', fill: c.color(i)});
      if (w.hit === i) f.classList.add('bd-hit');
    }
    c.item(strip, c.cx, c.cy, {enter: 'slide-r'});
    (w.marks ?? []).forEach((m, i) => {
      const x = c.cx - wd / 2 + num(m.at, 0.5) * wd;
      const pin = make('div', 'bd-item bd-pin', c.el);
      pin.style.background = m.color ?? c.color(i + 1);
      pin.style.height = `${260 * c.U}px`;
      c.item(pin, x, c.cy, {t0: 0.8 + i * 0.5, enter: 'drop'});
      c.tiles(m.text, {x, y: c.cy - 200 * c.U, size: 56, t0: 0.9 + i * 0.5, gap: 0.04});
    });
    if (w.caption) c.label(w.caption, c.cx, c.cy + 150 * c.U, {t0: 1.5});
  },

  // НАБОР
  cards(c, w) {
    const list = w.items ?? [];
    const cw = (c.portrait ? 520 : 330) * c.U, ch = (c.portrait ? 220 : 330) * c.U;
    // в вертикали карточки стопкой: крайние вместе со штампом под ними остаются в рабочей зоне
    const below = 0;
    const span = c.portrait ? Math.max(0.3, Math.min(0.74, (c.safe.h - ch - 2 * below) / c.safe.h)) : (list.length > 2 ? 0.7 : 0.45);
    const pos = c.spread(list.length, {span});
    list.forEach((s, i) => {
      const {outer, inner} = c.card({w: cw, h: ch, fill: s.color ?? c.color(i), cls: 'bd-option'});
      if (s.icon) inner.appendChild(Object.assign(c.icon(s.icon, (c.portrait ? 110 : 130) * c.U, {a: 'var(--paper)', b: '#151413', c: c.color(i + 1)}), {className: 'bd-icon bd-inline'}));
      c.text(inner, s.title, {size: c.portrait ? 54 : 50});
      c.item(outer, pos[i].x, pos[i].y, {rot: (i - 1) * 2, t0: 0.2 + i * 0.6, enter: 'drop'});
      if (s.verdict) {
        const n = make('div', `bd-item bd-stamp ${s.good ? 'bd-good' : ''}`, c.el);
        c.text(n, s.verdict, {size: c.portrait ? 44 : 34});
        // в вертикали штамп в правом верхнем углу своей карточки: значок по центру, надпись снизу, угол свободен;
        // под карточкой он ложится на соседнюю в стопке
        c.item(n, pos[i].x + (c.portrait ? cw * 0.31 : 0), pos[i].y + (c.portrait ? -ch * 0.5 + 52 * c.U : ch * 0.62), {rot: -5, t0: 0.7 + i * 0.6, enter: 'stamp'});
      }
    });
  },
  ranking(c, w) {
    const rows = w.items ?? [];
    const {outer, inner} = c.card({w: Math.min(c.safe.w * (c.portrait ? 0.98 : 0.66), 1000 * c.U), cls: 'bd-doc bd-rank'});
    if (w.kicker) c.text(inner, w.kicker, {size: 28, font: 'mono', cls: 'bd-kicker'});
    const lines = rows.map((r, i) => {
      const ln = make('div', 'bd-rankline', inner);
      c.text(ln, `#${i + 1}`, {size: 30, font: 'mono', cls: 'bd-ranknum'});
      c.text(ln, r, {size: c.portrait ? 40 : 30, font: 'body', upper: false});
      return ln;
    });
    const rx = c.portrait ? c.cx : c.cx - c.safe.w * 0.12;
    c.item(outer, rx, c.cy + (c.portrait ? 80 * c.U : 0), {enter: 'rise', tick: (u) => lines.forEach((l, i) => { l.style.opacity = invLerp(0.4 + i * 0.16, 0.55 + i * 0.16, u); })});
    if (w.badge) {
      const bx = c.portrait ? c.cx : c.cx + c.safe.w * 0.34, by = c.portrait ? c.safe.y + 70 * c.U : c.cy;
      c.tiles(w.badge, {x: bx, y: by, size: c.portrait ? 110 : 140, t0: 0.5});
    }
  },
  table(c, w) {
    const cols = w.columns ?? [];
    const rows = w.rows ?? [];
    const {outer, inner} = c.card({w: Math.min(c.safe.w * 0.96, 1300 * c.U), cls: 'bd-doc bd-notebook'});
    const head = make('div', 'bd-trow bd-thead', inner);
    cols.forEach((h, i) => { const t = c.text(head, h, {size: c.portrait ? 30 : 36}); t.style.color = c.accent(i); });
    const trs = rows.map((r) => {
      const tr = make('div', 'bd-trow', inner);
      r.forEach((cell) => c.text(tr, cell, {size: c.portrait ? 26 : 28, font: 'mono', upper: false}));
      return tr;
    });
    c.item(outer, c.cx, c.cy, {rot: -1, enter: 'rise', tick: (u) => {
      [...head.children].forEach((h, i) => { h.style.opacity = invLerp(0.3 + i * 0.2, 0.45 + i * 0.2, u); });
      trs.forEach((tr, i) => { tr.style.opacity = invLerp(1 + i * 0.25, 1.15 + i * 0.25, u); });
    }});
  },
  grid(c, w) {
    const cols = w.columns ?? ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const per = num(w.perColumn, 12);
    const {outer, inner} = c.card({w: Math.min(c.safe.w * 0.96, 1180 * c.U), cls: 'bd-doc bd-grid'});
    const head = make('div', 'bd-gridhead', inner);
    cols.forEach((h, i) => { const t = c.text(head, h, {size: 28}); t.style.background = c.accent(i); t.style.color = onColor(c.accent(i)); });
    const body = make('div', 'bd-gridbody', inner);
    const cells = [];
    cols.forEach((_, ci) => {
      const col = make('div', 'bd-gridcol', body);
      for (let k = 0; k < per; k++) { const cell = make('i', '', col); cell.style.background = c.accent(Math.floor(c.rand() * 3)); cells.push(cell); }
    });
    const foot = w.total ? make('div', 'bd-gridfoot', inner) : null;
    if (foot) c.text(foot, w.total, {size: 34});
    c.item(outer, c.cx, c.cy, {enter: 'rise', tick: (u) => {
      const k = invLerp(0.5, 0.5 + (w.secs ?? 1.6), u);
      cells.forEach((cell, i) => { cell.style.opacity = i / cells.length < k ? 1 : 0; });
      if (foot) foot.style.opacity = invLerp(0.6 + (w.secs ?? 1.6), 0.9 + (w.secs ?? 1.6), u);
    }});
  },
  mosaic(c, w) {
    const n = num(w.count, 24);
    const cols = c.portrait ? 5 : 8;
    const cell = Math.min(c.safe.w / (cols + 1), 150 * c.U);
    const rows = Math.ceil(n / cols);
    for (let i = 0; i < n; i++) {
      const {outer, inner} = c.card({w: cell * 0.92, h: cell * 1.2, cls: 'bd-thumb'});
      c.picture(inner, w.srcs?.[i % (w.srcs?.length || 1)], {iconName: 'play', fill: c.color(i)});
      const x = c.cx + ((i % cols) - (cols - 1) / 2) * cell;
      const y = c.cy + (Math.floor(i / cols) - (rows - 1) / 2) * cell * 1.3 + (w.value !== undefined ? 60 * c.U : 0);
      c.item(outer, x, y, {rot: (c.rand() - 0.5) * 8, t0: 0.15 + i * (1.4 / n), enter: 'pop'});
    }
    if (w.value !== undefined) {
      const sub = {...c, cy: c.safe.y + 60 * c.U};
      BUILD.counter(sub, {...w, values: [0, w.value], size: 90, style: 'tape', caption: undefined});
    }
  },
  fan(c, w) {
    const n = num(w.count, 15);
    const spread = num(w.spread, 120);
    // крайние карточки веера остаются в рабочей зоне по ширине: R·sin(угла/2) + полкарточки ≤ полширины зоны
    const R = Math.min((c.portrait ? 470 : 560) * c.U, c.safe.h * 0.62, (c.safe.w / 2 - 125 * c.U) / Math.sin((Math.min(spread, 170) / 2) * Math.PI / 180));
    const pivot = {x: c.cx, y: c.cy + R * 0.9};
    for (let i = 0; i < n; i++) {
      const a = -spread / 2 + (spread * i) / (n - 1);
      const {outer, inner} = c.card({w: 120 * c.U, h: 210 * c.U, cls: 'bd-thumb'});
      c.picture(inner, w.srcs?.[i % (w.srcs?.length || 1)], {iconName: 'play', fill: c.color(i)});
      const it = c.item(outer, pivot.x, pivot.y - R, {rot: 0, t0: 0.2, enter: 'fade'});
      it.tick = (u) => {
        const k = power3Out(invLerp(0.2, 1.3, u));
        const ang = a * k;
        const rad = (ang * Math.PI) / 180;
        it.x = pivot.x + Math.sin(rad) * R; it.y = pivot.y - Math.cos(rad) * R; it.rot = ang;
      };
    }
    if (w.title) c.tiles(w.title, {x: c.cx, y: pivot.y - R * 0.12, size: c.portrait ? 80 : 90, t0: 1.2});
  },

  // ПРЕДМЕТЫ
  icon(c, w) {
    const sz = (w.size ?? 1) * (c.portrait ? 440 : 420) * c.U;
    if (w.burst) c.item(c.icon('burst', sz * 1.45, {a: 'var(--paper)', b: 'var(--paper)', c: 'var(--paper)'}), c.cx, c.cy - 20 * c.U, {t0: 0.1, enter: 'pop'});
    const n = c.icon(w.icon ?? 'star', sz);
    c.item(n, c.cx, c.cy - 20 * c.U, {t0: 0.2, enter: 'pop'});
    if (w.confetti) {
      for (let i = 0; i < 18; i++) {
        const p = make('div', 'bd-item bd-confetti', c.el);
        p.style.background = c.color(i);
        const ang = c.rand() * Math.PI * 2, d = (0.5 + c.rand() * 0.6) * sz;
        const it = c.item(p, c.cx, c.cy, {t0: 0.25, enter: 'fade'});
        it.tick = (u) => { const k = power3Out(invLerp(0.25, 1.2, u)); it.x = c.cx + Math.cos(ang) * d * k; it.y = c.cy - 20 * c.U + Math.sin(ang) * d * k + 60 * c.U * invLerp(0.8, 3, u); it.rot = u * 200 * (i % 2 ? 1 : -1); };
      }
    }
    if (w.cross) {
      const x = make('div', 'bd-item bd-cross', c.el);
      x.style.width = x.style.height = `${sz * 1.05}px`;
      const bars = [make('i', '', x), make('i', '', x)];
      c.item(x, c.cx, c.cy - 20 * c.U, {t0: 0.8, enter: 'none', tick: (u) => bars.forEach((b, i) => b.style.setProperty('--k', power3Out(invLerp(0.9 + i * 0.25, 1.2 + i * 0.25, u)).toFixed(3)))});
    }
    if (w.label) c.words(w.label, {x: c.cx, y: c.cy + sz * 0.62, size: 56, accent: w.accent ?? [], t0: 0.9});
  },
  badge(c, w) {
    const sz = (c.portrait ? 520 : 460) * c.U;
    const n = c.icon('rosette', sz, {a: w.color ?? c.color(1), b: c.color(0), c: c.color(0)});
    const t = make('div', 'bd-badgetext', n);
    c.text(t, w.text ?? '#1', {size: w.size ?? 84});
    c.item(n, c.cx, c.cy, {rot: 8, enter: 'stamp', t0: 0.2});
  },
  screen(c, w) {
    const tv = (w.device ?? 'phone') === 'tv';
    const box = make('div', `bd-item bd-device ${tv ? 'bd-tv' : 'bd-phone'}`, c.el);
    const bw = tv ? Math.min(c.safe.w * 0.7, 900 * c.U, c.safe.h * 1.25) : Math.min((c.portrait ? 470 : 420) * c.U, c.safe.h / 2.1);
    box.style.width = `${bw}px`; box.style.height = `${tv ? bw * 0.7 : bw * 2.05}px`;
    if (tv) box.style.background = w.color ?? c.color(3);
    const scr = make('div', 'bd-screen', box);
    c.picture(scr, w.src, {iconName: w.icon ?? 'play'});
    if (tv) { const k = make('div', 'bd-knobs', box); make('i', '', k); make('i', '', k); }
    const sx = c.portrait ? c.cx : c.cx - (w.chips || w.caption ? c.safe.w * 0.14 : 0);
    c.item(box, sx, c.cy, {rot: tv ? -2 : 0, enter: 'rise'});
    (w.chips ?? []).forEach((s, i) => {
      const {outer, inner} = c.card({w: c.measure(s, 28, 'body') + 60 * c.U, h: 64 * c.U, fill: c.color(i), cls: 'bd-chip'});
      c.text(inner, s, {size: 28, font: 'body', upper: false});
      const x = c.portrait ? c.cx + (i - ((w.chips.length - 1) / 2)) * 200 * c.U : sx + bw / 2 + 160 * c.U + i * 26 * c.U;
      const y = c.portrait ? c.cy + bw * 1.08 : c.cy - 80 * c.U + i * 90 * c.U;
      c.item(outer, x, y, {rot: (i - 1) * 3, t0: 0.8 + i * 0.2});
    });
    if (w.caption) c.words(w.caption, {x: c.portrait ? c.cx : sx + bw / 2 + 300 * c.U, y: c.portrait ? c.safe.y + 30 * c.U : c.cy + 180 * c.U, size: 48, accent: w.accent ?? [], t0: 1.0, maxW: c.portrait ? c.safe.w : 520 * c.U});
  },
  photo(c, w) {
    const pw = (w.w ?? (c.portrait ? 0.62 : 0.34)) * c.W;
    const {outer, inner} = c.card({w: pw, cls: 'bd-polaroid', tape: true});
    const pic = make('div', 'bd-polapic', inner);
    pic.style.height = `${pw * 0.78}px`;
    c.picture(pic, w.src, {iconName: w.icon ?? 'camera'});
    if (w.caption) c.text(inner, w.caption, {size: 34, cls: 'bd-polacap'});
    // штамп — часть снимка: под его нижним краем справа, мимо подписи
    const spec = w.stamp && (typeof w.stamp === 'string' ? {text: w.stamp} : w.stamp);
    let st = null;
    if (spec && spec.x === undefined && spec.y === undefined) {
      st = make('div', `bd-stamp bd-stamp-under ${spec.tone === 'good' ? 'bd-good' : ''}`, outer);
      c.text(st, spec.text, {size: spec.size ?? 46});
      w._stampInCard = true;
    }
    const st0 = spec?.at ?? 1.6;
    c.item(outer, c.cx, c.cy, {rot: w.rot ?? -3, enter: 'drop', tick: st ? (u) => { const a = appear(u - st0, 'stamp'); st.style.opacity = a.o; st.style.transform = `rotate(${(spec.rot ?? -6) + a.r}deg) scale(${a.s})`; } : undefined});
  },
  search(c, w) {
    const bar = make('div', 'bd-item bd-search', c.el);
    bar.style.width = `${Math.min(c.safe.w * 0.86, 1100 * c.U)}px`;
    bar.appendChild(Object.assign(c.icon('magnifier', 80 * c.U, {a: '#151413', b: '#151413', c: '#151413'}), {className: 'bd-icon bd-inline'}));
    const q = make('div', 'bd-query', bar);
    q.style.fontSize = `${52 * c.U}px`;
    const text = String(w.query ?? '');
    c.item(bar, c.cx, c.cy, {enter: 'pop', tick: (u) => { q.innerHTML = `${esc(typeAt(text, u - 0.4, w.cps ?? 16))}<b class="bd-caret"></b>`; }});
  },
  orbit(c, w) {
    const sz = (c.portrait ? 400 : 380) * c.U;
    c.item(c.icon(w.icon ?? 'globe', sz), c.cx, c.cy, {t0: 0.15, enter: 'pop'});
    const list = w.items ?? ['LIVE', 'LIVE', 'LIVE', 'LIVE', 'LIVE'];
    list.forEach((s, i) => {
      const ang = (-90 + (360 * i) / list.length) * Math.PI / 180;
      const R = sz * 0.75;
      const n = make('div', 'bd-item bd-stamp bd-small', c.el);
      c.text(n, s, {size: c.portrait ? 50 : 40});
      c.item(n, c.cx + Math.cos(ang) * R * (c.portrait ? 1 : 1.35), c.cy + Math.sin(ang) * R, {rot: (c.rand() - 0.5) * 20, t0: 0.6 + i * 0.22, enter: 'stamp'});
    });
  },
  subscribe(c, w) {
    const {outer, inner} = c.card({w: Math.min(c.safe.w * 0.86, 900 * c.U), cls: 'bd-comment'});
    inner.appendChild(Object.assign(c.icon('chat', 80 * c.U, {a: '#151413', b: c.color(0), c: c.color(1)}), {className: 'bd-icon bd-inline'}));
    const q = make('div', 'bd-query', inner);
    q.style.fontSize = `${46 * c.U}px`;
    const text = String(w.question ?? '');
    const cps = Math.max(w.cps ?? 22, text.length / Math.max(1, c.dur - 3.4));   // кнопка стоит не меньше 2 с
    c.item(outer, c.cx, c.cy - 80 * c.U, {enter: 'pop', tick: (u) => { q.innerHTML = `${esc(typeAt(text, u - 0.4, cps))}`; }});
    const t0 = 0.6 + text.length / cps;
    if (w.hint) c.label(w.hint, c.cx, c.cy + 50 * c.U, {t0});
    const btn = make('div', 'bd-item bd-button', c.el);
    c.text(btn, w.button ?? 'SUBSCRIBED ✓', {size: 54});
    c.item(btn, c.cx + (c.portrait ? 0 : c.safe.w * 0.22), c.cy + 170 * c.U, {t0: t0 + 0.3, enter: 'pop'});
  },
};

// мелкие доступы к контексту изнутри слов
function caps(c) { return c.caps; }
