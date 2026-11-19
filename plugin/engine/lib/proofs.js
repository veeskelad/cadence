// Слой доказательств поверх кадра: у каждого имени, цитаты и сравнения своя вставка, и ни одна не стоит.
// Виды:
//   logo    — знак или значок, после посадки покачивается;
//   card    — картинка или кусок видео в рамке: внутри наезд (push), врезка-рамка (mark), кусок кадра крупно (crop),
//             подпись, состояние «плохо» (кадр сереет, рамка краснеет, толчок);
//   article — карточка статьи: из текста (маркер по словам) или снимок страницы в окне (shot), сразу на цитате;
//             окно влетает и после посадки стоит — цитату читают, движется только маркер по строкам под голос;
//   race    — «насколько дольше» одним проходом: в строке неподвижные солнце и луна, полоса между ними заливается один раз,
//             короткий день доходит до луны раньше длинного, луна загорается, солнце тускнеет; ничего не катится и не повторяется;
//             заголовок title над дорожками, подпись tag — плашкой в конце своей строки;
//   ring    — кольцо на точке, пульсирует;
//   box     — рамка, которая едет по ключам за объектом;
//   measure — замер между двумя точками; stretch — конец уезжает к новой точке, подпись сменяется («было → стало»);
//   road    — во весь кадр: улица в 3D, дорога сужается, вырастают дома, камера поднимается;
//   title   — крупный титр курсивом сверху («было» и «стало» двумя титрами на двух планах), проявляется из размытия;
//   alert   — «осторожно»: значок предупреждения на точке пульсирует, по краю кадра дышит полоса цвета --bad;
//   click   — курсор жмёт на кнопку, кнопка меняет состояние (подписаться → подписан), от неё расходится кольцо.
// Вид рамки look: 'corners' — уголки и тонкий контур, как в прицеле записи; card.zoom — кусок кадра крупно на своём же
// месте («лупа»): растёт из своего прямоугольника, вокруг уголки.
// Слово вместо вида: word (WORDS, PRESETS) — «рамка», «лупа», «титр», «тревога», «клик» и другие; resolveProof.
// backdrop: true у любой вставки, кроме карточки с видео, — кадр под ней притушен целиком (крупная анимация, склейки фона).
// Отдельно — переход lightbar: полоса света идёт по кадру, склейка под засветкой (mountLightbars).
//
// Разделено на две части:
//   proofState(p, t, frame) — чистая функция: что видно в момент t (числа, без DOM и без памяти между кадрами),
//                             поэтому кадр при перемотке в любую точку тот же;
//   mountProofs(...)        — один раз строит элементы и возвращает render(t), который только ставит числа в стили.
//
// Сценарий — film.proofs (формат — examples/proofs/film.json, правила — knowledge/effects-bank/code-proofs.md).
// Координаты — доли кадра: x и w от ширины, y и h от высоты. Время — секунды или "@якорь" (scripts/word_anchors.py).
// Цвета — переменные пака: --signal (рамки, ярлыки), --signal-2 (маркер, солнце, свет), --ink и --canvas (карточки),
// --surface, --muted и --line (служебные строки, дорога), --bad (состояние «плохо», data-bad на корне шаблона).

import {clamp, invLerp, lerp, rng, smoothstep} from './motion.js';

export const KINDS = ['logo', 'card', 'article', 'race', 'ring', 'box', 'measure', 'road', 'title', 'alert', 'click'];
// Слова сценария → вид вставки. Слово выбирают по смыслу фразы голоса (колонка «Голос» в code-proofs.md).
export const WORDS = {
  'знак': 'logo', 'врезка': 'card', 'статья': 'article', 'дорожки': 'race', 'кольцо': 'ring', 'рамка': 'box',
  'замер': 'measure', 'дорога': 'road', 'титр': 'title', 'тревога': 'alert', 'клик': 'click',
};
// Слова-варианты: вид плюс готовые поля; поля сценария сильнее.
export const PRESETS = {
  'уголки': {kind: 'box', look: 'corners'},
  'лупа': {kind: 'card', zoom: 1.3},
};
// Синонимы слов (колонка «Ещё называют» в code-proofs.md): тот же приём под другим именем
export const SYNONYMS = {
  'логотип': 'знак', 'лого': 'знак', 'карточка': 'врезка', 'цитата': 'статья', 'обводка': 'кольцо', 'выделение': 'рамка',
  'прицел': 'уголки', 'скобки': 'уголки', 'зум': 'лупа', 'увеличение': 'лупа', 'приближение': 'лупа', 'линейка': 'замер',
  'надпись': 'титр', 'предупреждение': 'тревога', 'внимание': 'тревога', 'опасность': 'тревога', 'кнопка': 'клик', 'подписка': 'клик',
};
export const LOOKS = ['frame', 'corners'];
export const ZOOM = {min: 1.1, max: 2.2};
export const ALERT = {pulse: 1.1, icon: 0.5};   // период пульса значка и полосы, с; значок встаёт через 0,5 с после края
export const CLICK = {press: 0.18, ring: 0.55}; // нажатие и кольцо после клика, с
// Слово → вставка с видом: {word: 'лупа', ...} → {kind: 'card', zoom: 1.3, ...}. Неизвестное слово — ошибка с подсказкой.
export function resolveProof(p) {
  if (!p || p.kind || p.word === undefined) return p;
  const w0 = String(p.word).trim().toLowerCase(), w = SYNONYMS[w0] ?? w0;
  if (PRESETS[w]) return {...PRESETS[w], ...p, kind: PRESETS[w].kind};
  if (WORDS[w]) return {...p, kind: WORDS[w]};
  throw new Error(`Слой доказательств: неизвестное слово «${p.word}», есть ${[...Object.keys(WORDS), ...Object.keys(PRESETS)].join(', ')} (и синонимы: ${Object.keys(SYNONYMS).join(', ')})`);
}
// Лупа: кусок кадра crop растёт в zoom раз вокруг своего центра. Видео лупы — вторая запись файла фона с тем же
// mediaStart, кадр фона во весь кадр композиции. Доли кадра: x, y — центр; w, h — размер после увеличения.
export function zoomGeom(p) {
  const [cx, cy, cw, ch] = p.crop;
  return {x: cx + cw / 2, y: cy + ch / 2, w: Math.min(1, cw * p.zoom), h: Math.min(1, ch * p.zoom)};
}
// Вход 0,45 с с торможением (power3.out), уход 0,4 с плавно, к концу вставки прозрачность 0.
export const ENTER = 0.45;
export const EXIT = 0.4;
export const MIN_ON = ENTER + EXIT;
// Кривые в именах GSAP: power1 — квадрат, power2 — куб, power3 — четвёртая степень.
export const power3Out = (u) => 1 - (1 - clamp(u)) ** 4;
export const power2In = (u) => clamp(u) ** 3;
export const power2Out = (u) => 1 - (1 - clamp(u)) ** 3;
export const power2InOut = (u) => (u = clamp(u), u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2);
export const power1InOut = (u) => (u = clamp(u), u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
export const sineInOut = (u) => -(Math.cos(Math.PI * clamp(u)) - 1) / 2;
const backOut = (u, c1 = 1.4) => (u = clamp(u), 1 + (c1 + 1) * (u - 1) ** 3 + c1 * (u - 1) ** 2);

// Движение после посадки: вставка плывёт вверх и доворачивается на всю оставшуюся жизнь (sine.inOut).
export const DRIFT = {logo: 26, other: 18, rot: 1.6};
export const PUSH = 1.14;          // наезд внутри карточки по умолчанию
export const RING_PULSE = 0.08;    // кольцо дышит на 8 % раз в секунду
export const LIGHTBAR = {pre: 0.4, post: 0.45};

const r3 = (x) => Math.round(x * 1000) / 1000;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const FRAME = {W: 1080, H: 1920};

export const proofEnd = (p) => (num(p.to) ? p.to : r3(p.at + (p.dur ?? 1.6)));

// Проверка сценария до первого кадра: ошибка называет вставку и поле.
export function validateProofs(list = [], {duration = Infinity, videos = [], W = FRAME.W, H = FRAME.H} = {}) {
  const errors = [];
  const ids = new Set(videos.map((v) => v.id));
  const share = (v) => num(v) && v >= 0 && v <= 1;
  const rect01 = (r) => Array.isArray(r) && r.length === 4 && r.every(share);
  list.forEach((p0, i) => {
    let p;
    try { p = resolveProof(p0); } catch (e) { errors.push(`proofs[${i}]: ${e.message.replace('Слой доказательств: ', '')}`); return; }
    const what = `proofs[${i}] (${p0?.word ?? p?.kind})`;
    if (!KINDS.includes(p?.kind)) { errors.push(`${what}: неизвестный вид, есть ${KINDS.join(', ')}`); return; }
    if (!num(p.at)) errors.push(`${what}: at — число секунд (ссылки "@якорь" сначала разрешает word_anchors.py)`);
    const end = proofEnd(p);
    if (num(p.at) && end - p.at < MIN_ON - 1e-6) errors.push(`${what}: на экране ${(end - p.at).toFixed(2)} с, нужно от ${MIN_ON} с (вход ${ENTER} + уход ${EXIT})`);
    if (num(p.at) && end > duration + 1e-6) errors.push(`${what}: уходит на ${end} с, ролик ${duration} с`);
    for (const k of ['x', 'y', 'w', 'h', 'r', 'vh']) if (p[k] !== undefined && !share(p[k])) errors.push(`${what}: ${k} = ${p[k]} — доля кадра от 0 до 1`);
    const inside = (k) => { if (p[k] !== undefined && (!num(p[k]) || p[k] < p.at || p[k] > end)) errors.push(`${what}: ${k} — момент внутри вставки ${p.at}–${end} с`); };
    if (p.kind === 'logo' && !p.src) errors.push(`${what}: нет src`);
    if (p.kind === 'card') {
      if (!p.src && !p.video) errors.push(`${what}: нужен src (картинка) или video (id из film.videos)`);
      if (p.video && !ids.has(p.video)) errors.push(`${what}: нет видео ${p.video} в film.videos`);
      if (p.blurBg && !ids.has(p.blurBg)) errors.push(`${what}: нет видео ${p.blurBg} в film.videos`);
      for (const id of [p.video, p.blurBg].filter(Boolean)) {
        const v = videos.find((x) => x.id === id);
        if (v && num(v.start) && num(v.duration) && (v.start > p.at + 1e-6 || v.start + v.duration < end - 1e-6)) {
          errors.push(`${what}: видео ${id} идёт ${v.start}–${r3(v.start + v.duration)} с, а вставка ${p.at}–${end} с: start и duration видео должны её накрывать`);
        }
      }
      if (p.blurBg && p.video && videos.findIndex((v) => v.id === p.blurBg) > videos.findIndex((v) => v.id === p.video)) {
        errors.push(`${what}: в film.videos размытый фон ${p.blurBg} должен идти раньше ${p.video}, иначе ляжет поверх`);
      }
      inside('bad');
      if (p.backdrop && p.video) errors.push(`${what}: backdrop не сочетается с видео в карточке — видео лежит под слоем и тоже притухнет`);
      if (p.push !== undefined && !(num(p.push) && p.push >= 1 && p.push <= 1.6)) errors.push(`${what}: push — наезд от 1 (без) до 1,6`);
      if (p.mark !== undefined && !rect01(p.mark)) errors.push(`${what}: mark — [x, y, w, h] долями карточки`);
      if (p.crop !== undefined && (!p.video || !rect01(p.crop))) errors.push(`${what}: crop — [x, y, w, h] долями кадра видео, только у карточки с video`);
      if (p.zoom !== undefined) {
        if (!(num(p.zoom) && p.zoom >= ZOOM.min && p.zoom <= ZOOM.max)) errors.push(`${what}: zoom — увеличение куска кадра от ${ZOOM.min} до ${ZOOM.max}`);
        if (!p.video || !rect01(p.crop)) errors.push(`${what}: лупе нужны video (вторая запись файла фона) и crop — [x, y, w, h] долями кадра`);
        for (const k of ['x', 'y', 'w', 'h']) if (p[k] !== undefined) errors.push(`${what}: у лупы ${k} считается из crop и zoom, задавать не нужно`);
        if (p.blurBg || p.backdrop) errors.push(`${what}: лупа стоит на своём месте кадра — без blurBg и backdrop`);
      }
    }
    if (p.kind === 'box' && p.look !== undefined && !LOOKS.includes(p.look)) errors.push(`${what}: look — ${LOOKS.join(' или ')}`);
    if (p.kind === 'title' && !String(p.text ?? '').trim()) errors.push(`${what}: нет text`);
    if (p.kind === 'alert' && p.c !== undefined && !(Array.isArray(p.c) && p.c.every(share))) errors.push(`${what}: c — [x, y] значка долями кадра`);
    if (p.kind === 'click') {
      if (p.clickAt !== undefined && (!num(p.clickAt) || p.clickAt < p.at + 0.5 || p.clickAt > end - 0.6)) {
        errors.push(`${what}: clickAt — не раньше чем через 0,5 с после входа (курсор доезжает) и не позже чем за 0,6 с до конца`);
      }
    }
    if (p.kind === 'article') {
      if (p.shot) {
        const m = p.shotMeta;
        if (!m || !num(m.width) || !Array.isArray(m.lines) || !m.lines.length) errors.push(`${what}: у снимка нет описания строк цитаты (json рядом со снимком из scripts/news_shot.py)`);
      } else {
        if (!p.quote) errors.push(`${what}: нет quote (или shot — снимок страницы)`);
        const n = String(p.quote ?? '').trim().split(/\s+/).length;
        const [a, b] = p.markWords ?? [0, n - 1];
        if (!(Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= a && b < n)) errors.push(`${what}: markWords [${a}, ${b}] — номера слов цитаты с 0, всего ${n}`);
      }
      inside('markFrom'); inside('markTo');
    }
    if (p.kind === 'race') {
      if (!(Array.isArray(p.rows) && p.rows.length >= 2)) errors.push(`${what}: rows — две дорожки и больше`);
      else p.rows.forEach((r, j) => { if (!(num(r.period) && r.period > 0)) errors.push(`${what}: rows[${j}].period — длина дня строки, больше нуля (время заливки — доля от самой длинной)`); });
    }
    if (p.kind === 'ring' && !(Array.isArray(p.c) && p.c.every(share))) errors.push(`${what}: c — [x, y] долями кадра`);
    if (p.kind === 'box') {
      const keys = p.keys ?? (p.rect ? [{t: p.at, rect: p.rect}] : null);
      if (!keys?.length) errors.push(`${what}: нужен rect или keys`);
      else keys.forEach((k, j) => {
        if (!num(k.t)) errors.push(`${what}: keys[${j}].t — время в секундах ролика`);
        if (!rect01(k.rect)) errors.push(`${what}: keys[${j}].rect — [x, y, w, h] долями кадра`);
        if (j && num(k.t) && k.t <= keys[j - 1].t) errors.push(`${what}: keys идут по возрастанию времени`);
      });
    }
    if (p.kind === 'measure') {
      if (![p.a, p.b].every((pt) => Array.isArray(pt) && pt.every(share))) errors.push(`${what}: a и b — [x, y] долями кадра`);
      if (p.stretch) {
        if (!(Array.isArray(p.stretch.b) && p.stretch.b.every(share))) errors.push(`${what}: stretch.b — новая точка [x, y] долями кадра`);
        if (!num(p.stretch.at) || p.stretch.at < p.at + ENTER || p.stretch.at > end - 0.9) errors.push(`${what}: stretch.at — после входа и не позже чем за 0,9 с до конца`);
      }
    }
    if (p.kind === 'road') {
      if (W > H) errors.push(`${what}: схема дороги собрана под вертикальный кадр`);
      inside('narrow'); inside('fill'); inside('rise');
    }
  });
  if (errors.length) throw new Error('Слой доказательств:\n  ' + errors.join('\n  '));
  return list.length;
}

// Огибающая: k — вход 0→1 за ENTER (power3.out), out — 1→0 за EXIT до конца, on — вставка в кадре.
export function envelope(t, at, end, {exit = true} = {}) {
  const on = t >= at && t < end;
  const k = power3Out(invLerp(at, at + ENTER, t));
  const out = exit ? 1 - smoothstep(end - EXIT, end, t) : 1;
  return {on, k: on ? k : 0, out: on ? out : 0};
}

// Откуда влетает: pop — из 0,6 с докрутом, up — снизу, right — справа (доли кадра).
const FROM = {
  pop: {dx: 0, dy: 0, s: 0.6, rot: 10},
  up: {dx: 0, dy: 0.22, s: 1, rot: 14},
  right: {dx: 0.65, dy: 0, s: 1, rot: 10},
};

// Рамка по ключам: между ключами — линейно (рамка следит за объектом), до первого и после последнего — стоит.
export function rectAt(keys, t) {
  if (t <= keys[0].t) return keys[0].rect;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t < b.t) {
      const u = invLerp(a.t, b.t, t);
      return a.rect.map((v, j) => lerp(v, b.rect[j], u));
    }
  }
  return keys[keys.length - 1].rect;
}

// Маркер по словам цитаты: [первое, последнее] слово закрашиваются по очереди равными долями отрезка [m0, m1].
export function markAt(t, {m0, m1, from, to}) {
  const n = to - from + 1, step = Math.max(0.02, (m1 - m0) / n);
  return Array.from({length: n}, (_, j) => clamp((t - m0 - j * step) / step));
}

export function markSpan(p) {
  const n = String(p.quote).trim().split(/\s+/).length;
  const [from, to] = p.markWords ?? [0, n - 1];
  const end = proofEnd(p);
  const m0 = num(p.markFrom) ? p.markFrom : p.at + ENTER;
  const m1 = num(p.markTo) ? p.markTo : Math.min(end - EXIT, m0 + 0.25 * (to - from + 1));
  return {m0, m1: Math.max(m0 + 0.2, m1), from, to, n};
}

// Дорожки одним проходом: заливка каждой строки идёт один раз, её время — доля period от самого длинного.
// Самый длинный день кончается за 0,5 с до начала ухода. Когда день строки кончился, луна загорается (back.out), солнце тускнеет.
export function raceTimes(p) {
  const t0 = p.at + 0.5, avail = Math.max(0.8, proofEnd(p) - EXIT - 0.5 - t0), maxP = Math.max(...p.rows.map((r) => r.period));
  return p.rows.map((r) => ({t0, dur: avail * r.period / maxP}));
}
export function raceRows(p, t) {
  return raceTimes(p).map(({t0, dur}) => {
    const done = t0 + dur, m = backOut(invLerp(done, done + 0.35, t), 2);
    return {fill: clamp((t - t0) / dur), moon: clamp(lerp(0.25, 1, m)), moonScale: lerp(1.4, 1, m),
      sun: lerp(1, 0.35, power2Out(invLerp(done, done + 0.3, t)))};
  });
}

// Снимок страницы в окне: раскладка в пикселях кадра. Шапка статьи стоит над абзацем, строки цитаты сдвинуты на её высоту.
export function shotGeom(p, {W, H} = FRAME) {
  const m = p.shotMeta, w = (p.w ?? 0.89) * W, k = w / m.width;
  const hh = m.head ? m.head.height * (w / m.head.width) + 18 : 0;
  const lines = m.lines.map((r) => [r[0] * k, r[1] * k + hh, r[2] * k, r[3] * k]);
  // окно по умолчанию вмещает шапку и абзац целиком, но не выше 800 px на кадре 1920
  const vh = p.vh !== undefined ? p.vh * H : Math.min(800 * H / 1920, hh + m.height * k);
  const qy = Math.min(...lines.map((r) => r[1])), qb = Math.max(...lines.map((r) => r[1] + r[3]));
  const end = proofEnd(p);
  const m0 = num(p.markFrom) ? p.markFrom : p.at + 0.5;
  const m1 = num(p.markTo) ? p.markTo : Math.min(end - 0.3, m0 + 0.5 * lines.length);
  // цитата посередине окна, но страница не уезжает дальше своих краёв: влезает целиком — стоит с самого верха
  const full = hh + m.height * k;
  return {w, hh, lines, vh, scroll: clamp((qy + qb) / 2 - vh / 2, 0, Math.max(0, full - vh)),
    m0, m1: Math.max(m0 + 0.2, m1)};
}

// Схема дороги: дома по сиду, у каждого второго «вырастает» после fill.
export function roadBuildings(seed = 7) {
  const rand = rng(seed), out = [];
  for (let side = 0; side < 2; side++) for (let k = 0; k < 9; k++) {
    const y = 300 + k * 420;
    out.push({side, y, d: 300, w: 300, h: Math.round(260 + rand() * 520), tone: Math.floor(rand() * 4), extra: false});
    out.push({side, y: y + 330, d: 90, w: 300, h: Math.round(200 + rand() * 380), tone: Math.floor(rand() * 4), extra: true});
  }
  return out;
}

// Переход «полоса света»: к склейке at полоса разгоняется и расширяется, засвечивает середину, после — уходит вправо.
export function lightbarState(t, at, W = FRAME.W) {
  const {pre, post} = LIGHTBAR;
  if (t < at - pre || t >= at + post) return {on: false};
  if (t < at) {
    const e = power2In(invLerp(at - pre, at, t));
    return {on: true, x: lerp(-0.62 * W, 0, e), sx: lerp(1, 7.5, e), opacity: e};
  }
  const e = power2Out(invLerp(at, at + post, t));
  return {on: true, x: lerp(0, 0.62 * W, e), sx: lerp(7.5, 1, e), opacity: 1 - e};
}

// Переход «вспышка» ({at, kind: 'flash'} в film.lightbars): к склейке засветка за FLASH.pre с, после — гаснет за FLASH.post.
export const FLASH = {pre: 0.12, post: 0.3, peak: 0.92};
export function flashState(t, at) {
  if (t < at - FLASH.pre || t >= at + FLASH.post) return 0;
  return t < at ? FLASH.peak * power2In(invLerp(at - FLASH.pre, at, t)) : FLASH.peak * (1 - power2Out(invLerp(at, at + FLASH.post, t)));
}

// Состояние вставки в момент t. Возвращает только числа: render переносит их в стили. frame — размер кадра в пикселях.
export function proofState(p0, t, frame = FRAME) {
  const p = resolveProof(p0);
  const {W, H} = frame;
  const end = proofEnd(p), d = end - p.at;
  const {on, k, out} = envelope(t, p.at, end, {exit: p.exit !== false});
  const s = {on, opacity: k * out, k, out};
  if (!on) return s;
  // backdrop: под крупной анимацией кадр притушен целиком, склейки фона не мельтешат
  if (p.backdrop) s.dim = power2Out(invLerp(p.at, p.at + 0.35, t)) * out;
  const rot = p.rot ?? 0;
  if (['logo', 'card', 'article', 'race'].includes(p.kind)) {
    // лупа растёт из своего прямоугольника в кадре: без сдвига и поворота, масштаб от 1/zoom
    const f = p.zoom ? {dx: 0, dy: 0, s: 1 / p.zoom, rot: 0} : FROM[p.enter ?? 'pop'] ?? FROM.pop;
    // после посадки — плывёт и доворачивается до конца жизни, а не стоит. Кроме статьи: цитату читают, текст стоит,
    // движется только маркер
    const still = p.kind === 'article';
    const life = still ? 0 : sineInOut(invLerp(p.at + 0.4, p.at + 0.4 + Math.max(0.3, d - 0.4), t));
    s.opacity = clamp(k * 1.6) * out;
    s.x = f.dx * (1 - k) * W;
    s.y = f.dy * (1 - k) * H - (p.kind === 'logo' ? DRIFT.logo : DRIFT.other) * life;
    s.scale = lerp(f.s, 1, k) * (1 - 0.04 * (1 - out));
    s.rot = rot + f.rot * (1 - k) + (rot >= 0 ? DRIFT.rot : -DRIFT.rot) * life;
    if (p.zoom) {
      // лупа держится над своим местом кадра: не плывёт и не доворачивается, живут наезд внутри и дыхание уголков
      s.opacity = clamp(k * 3) * out;
      s.y = 0; s.rot = 0;
      s.scale = lerp(f.s, 1, k) * (1 - 0.04 * (1 - out)) * (1 + 0.015 * Math.sin(2 * Math.PI * Math.max(0, t - p.at - ENTER) / 1.2));
    }
    if (p.kind === 'card') {
      const u = invLerp(p.at, end, t);
      s.push = lerp(1, p.push ?? (p.zoom ? 1.06 : PUSH), u);   // наезд внутри рамки на всю жизнь
      s.pushX = -2 * u;                      // и чуть в сторону, % ширины
      if (p.mark) {
        const m = power3Out(invLerp(p.at + 0.35, p.at + 0.65, t));
        s.mark = m; s.markScale = lerp(1.3, 1, m);
      }
      if (num(p.bad)) {
        // «как было — плохо»: кадр сереет, рамка краснеет, короткая дрожь
        s.bad = power3Out(invLerp(p.bad, p.bad + 0.25, t));
        const q = (t - p.bad) / 0.05;
        if (q >= 0 && q < 6) s.x += 14 * (Math.floor(q) % 2 ? 1 - (q % 1) : q % 1);
      }
    }
    if (p.kind === 'article' && !p.shot) s.marks = markAt(t, markSpan(p));
    if (p.kind === 'article' && p.shot) {
      // страница сразу стоит на цитате и не едет: текст читают
      const g = shotGeom(p, frame);
      s.scroll = g.scroll;
      const n = g.lines.length, ls = (g.m1 - g.m0) / n;
      s.lines = g.lines.map((_, q) => power1InOut((t - g.m0 - q * ls) / Math.max(0.12, ls)));
    }
    if (p.kind === 'race') s.rows = raceRows(p, t);
  } else if (p.kind === 'ring') {
    s.scale = lerp(1.6, 1, k) * (t > p.at + 0.3 ? 1 + RING_PULSE * (1 - Math.cos(Math.PI * (t - p.at - 0.3) / 0.5)) / 2 : 1);
  } else if (p.kind === 'box') {
    const keys = p.keys ?? [{t: p.at, rect: p.rect}];
    s.rect = rectAt(keys, t);
    s.scale = lerp(1.15, 1, k);
    // уголки после посадки дышат на 2,5 % — рамка в прицеле живая
    if (p.look === 'corners') s.scale *= 1 + 0.025 * Math.sin(2 * Math.PI * Math.max(0, t - p.at - ENTER) / 1.2);
  } else if (p.kind === 'title') {
    // титр проявляется из размытия и чуть крупнее, после посадки медленно растёт (камера наезжает на слово)
    s.opacity = clamp(k * 1.4) * out;
    s.blur = 18 * (1 - k) + 10 * (1 - out);
    s.scale = lerp(1.12, 1, k) * lerp(1, 1.04, sineInOut(invLerp(p.at + ENTER, end, t)));
  } else if (p.kind === 'alert') {
    // край кадра дышит, значок встаёт через ALERT.icon с и пульсирует
    const ph = Math.max(0, t - p.at) / ALERT.pulse;
    s.opacity = out;
    s.edge = k * (0.7 + 0.3 * (0.5 + 0.5 * Math.cos(2 * Math.PI * ph)));
    const ia = p.at + (p.iconAt !== undefined ? p.iconAt - p.at : ALERT.icon);
    const ik = power3Out(invLerp(ia, ia + 0.35, t));
    s.icon = ik;
    s.iconScale = lerp(0.4, 1, ik) * (t > ia + 0.35 ? 1 + 0.07 * (0.5 - 0.5 * Math.cos(2 * Math.PI * (t - ia - 0.35) / ALERT.pulse)) : 1);
  } else if (p.kind === 'click') {
    // кнопка встаёт, курсор доезжает к ней, нажатие, кнопка меняет состояние, кольцо расходится, курсор уходит
    const ca = p.clickAt ?? Math.min(end - 0.6, p.at + 0.9);
    s.opacity = clamp(k * 1.6) * out;
    s.scale = lerp(0.7, 1, k);
    s.y = -DRIFT.other * sineInOut(invLerp(p.at + 0.4, end, t));
    const q = invLerp(ca, ca + CLICK.press, t);
    s.press = q > 0 && q < 1 ? 1 - 0.08 * Math.sin(Math.PI * q) : 1;
    s.swap = power2Out(invLerp(ca + 0.04, ca + 0.16, t));
    const r = invLerp(ca + 0.06, ca + 0.06 + CLICK.ring, t);
    s.ring = {on: r > 0 && r < 1, scale: lerp(1, 1.35, power2Out(r)), opacity: 0.9 * (1 - r)};
    // курсор: из правого нижнего угла к правой части кнопки, после клика — вниз и прочь (px от центра кнопки)
    const come = power2InOut(invLerp(p.at + 0.15, ca - 0.08, t)), go = power2In(invLerp(ca + 0.45, ca + 0.95, t));
    s.cur = {x: lerp(0.3 * W, 0.12 * W, come) + 0.25 * W * go, y: lerp(0.16 * H, 0.012 * H, come) + 0.1 * H * go,
      opacity: clamp(invLerp(p.at + 0.1, p.at + 0.3, t)) * (1 - go)};
  } else if (p.kind === 'measure') {
    s.opacity = out;
    s.line = k;
    s.tickA = clamp(k * 4);
    s.tickB = clamp((t - p.at - 0.35) / 0.25);
    s.tag = power3Out(invLerp(p.at + 0.25, p.at + 0.6, t));
    s.stretch = 1; s.tag1 = 0;
    if (p.stretch) {
      const L = Math.hypot((p.b[0] - p.a[0]) * W, (p.b[1] - p.a[1]) * H);
      const K = Math.hypot((p.stretch.b[0] - p.a[0]) * W, (p.stretch.b[1] - p.a[1]) * H) / L;
      s.stretch = lerp(1, K, power2InOut(invLerp(p.stretch.at, p.stretch.at + 0.9, t)));
      s.tag *= 1 - power2In(invLerp(p.stretch.at, p.stretch.at + 0.2, t));
      s.tag1 = power3Out(invLerp(p.stretch.at + 0.5, p.stretch.at + 0.9, t));
      s.stretchK = K;
    }
  } else if (p.kind === 'road') {
    // во весь кадр: проявление 0,35 с, уход 0,35 с; разметка бежит навстречу весь план
    s.opacity = power2Out(invLerp(p.at, p.at + 0.35, t)) * (1 - power2In(invLerp(end - 0.35, end, t)));
    s.lane = (t - p.at) * 900;
    s.measure = power3Out(invLerp(p.at + 0.3, p.at + 0.7, t));
    s.rw = num(p.narrow) ? lerp(820, 330, power2InOut(invLerp(p.narrow, p.narrow + 1.1, t))) : 820;
    s.grow = num(p.fill) ? roadBuildings(p.seed).filter((b) => b.extra).map((_, j) => backOut(invLerp(p.fill + j * 0.045, p.fill + j * 0.045 + 0.45, t))) : null;
    const rise = num(p.rise) ? power2InOut(invLerp(p.rise, p.rise + 1.4, t)) : 0;
    s.cam = {rx: lerp(68, 18, rise), y: lerp(0, -900, rise), s: lerp(1, 0.62, rise)};
    const a0 = power3Out(invLerp(p.at + 0.35, p.at + 0.8, t)), off0 = num(p.narrow) ? power2In(invLerp(p.narrow, p.narrow + 0.25, t)) : 0;
    const a1 = num(p.narrow) ? power3Out(invLerp(p.narrow + 0.3, p.narrow + 0.75, t)) : 0;
    const hide = num(p.rise) ? 1 - power2In(invLerp(p.rise, p.rise + 0.3, t)) : 1;
    s.labels = [a0 * (1 - off0) * hide, a1 * hide];
  }
  return s;
}

const CSS = `
.pf { position: absolute; visibility: hidden; will-change: transform, opacity; }
.pf-box.corners { border: 3px solid rgba(255,255,255,.6); border-radius: 4px; box-shadow: 0 0 10px rgba(0,0,0,.25); }
.pf-cn { position: absolute; width: var(--cn, 40px); height: var(--cn, 40px); border: 0 solid var(--signal); filter: drop-shadow(0 0 5px rgba(0,0,0,.45)); }
.pf-cn.tl { left: -10px; top: -10px; border-left-width: 8px; border-top-width: 8px; border-top-left-radius: 7px; }
.pf-cn.tr { right: -10px; top: -10px; border-right-width: 8px; border-top-width: 8px; border-top-right-radius: 7px; }
.pf-cn.bl { left: -10px; bottom: -10px; border-left-width: 8px; border-bottom-width: 8px; border-bottom-left-radius: 7px; }
.pf-cn.br { right: -10px; bottom: -10px; border-right-width: 8px; border-bottom-width: 8px; border-bottom-right-radius: 7px; }
.pf-card.zoom .pf-frame { border: 3px solid rgba(255,255,255,.6); border-radius: 6px; box-shadow: 0 18px 50px rgba(0,0,0,.5); }
.pf.pf-title { text-align: center; font: italic 700 var(--fs, 132px)/1.05 Oswald, sans-serif; letter-spacing: .01em; color: #fff; white-space: nowrap;
  text-shadow: 0 6px 30px rgba(0,0,0,.55), 0 0 3px rgba(0,0,0,.45); transform-origin: 50% 50%; }
.pf-alert .al-edge { position: absolute; inset: 0; border: 6px solid color-mix(in srgb, var(--bad) 85%, transparent); box-shadow: inset 0 0 70px 6px color-mix(in srgb, var(--bad) 55%, transparent); }
.pf-alert .al-ic { position: absolute; width: var(--ic); height: var(--ic); border-radius: 50%; background: var(--bad); display: grid; place-items: center;
  box-shadow: 0 0 0 6px rgba(255,255,255,.85), 0 10px 28px rgba(0,0,0,.45); }
.pf-alert .al-ic svg { width: 58%; height: 58%; margin-top: -4%; }
.pf-click .ck-pill { position: absolute; left: 0; top: 0; display: grid; transform: translate(-50%, -50%); }
.pf-click .ck-pill > span { grid-area: 1 / 1; display: flex; align-items: center; justify-content: center; gap: 20px; padding: 34px 84px 36px; border-radius: 999px;
  font: 700 72px/1 'Golos Text', sans-serif; white-space: nowrap; box-shadow: 0 14px 40px rgba(0,0,0,.45); }
.pf-click .ck-pill .a { background: var(--bad); color: #fff; }
.pf-click .ck-pill .b { background: #fff; color: #141210; opacity: 0; }
.pf-click .ck-pill .b svg { width: 60px; height: 60px; }
.pf-click .ck-ring { position: absolute; box-sizing: border-box; border: 5px solid #fff; border-radius: 999px; visibility: hidden; }
.pf-click .ck-cur { position: absolute; left: 0; top: 0; width: 64px; height: 80px; filter: drop-shadow(0 4px 10px rgba(0,0,0,.5)); }
.pf-logo img { display: block; width: 100%; height: auto; filter: drop-shadow(0 10px 28px rgba(0,0,0,.5)); }
.pf-card .pf-frame { position: relative; box-sizing: border-box; width: 100%; height: 100%; border: 6px solid var(--signal); border-radius: var(--r-medium, 24px); overflow: hidden; box-shadow: 0 22px 60px rgba(0,0,0,.55); background: var(--canvas); }
.pf-card .pf-frame.light { border-color: var(--ink); }
.pf-card .pf-frame.video { background: transparent; box-shadow: none; }
.pf-card .pf-in { width: 100%; height: 100%; transform-origin: 50% 50%; }
.pf-card .pf-in img { display: block; width: 100%; height: 100%; object-fit: cover; }
.pf-card .pf-mark { position: absolute; box-sizing: border-box; border: 6px solid var(--signal); border-radius: var(--r-small, 10px); box-shadow: 0 0 16px rgba(0,0,0,.5); opacity: 0; }
.pf-label, .pf-tag { position: absolute; padding: 6px 16px 8px; border-radius: var(--r-small, 10px); background: var(--signal); color: var(--canvas); font: 700 42px/1 Oswald, sans-serif; text-transform: uppercase; white-space: nowrap; }
.pf-label { left: 18px; top: -30px; }
.pf-tag { left: -6px; top: -60px; }
.pf-article { box-sizing: border-box; background: var(--ink); color: var(--canvas); border-radius: var(--r-medium, 24px); padding: 22px 30px 30px; box-shadow: 0 22px 60px rgba(0,0,0,.55); }
.pf-article .pf-bar { display: flex; align-items: center; gap: 9px; margin-bottom: 16px; }
.pf-article .pf-bar i { width: 14px; height: 14px; border-radius: 50%; background: var(--muted); opacity: .55; }
.pf-article .pf-bar span { margin-left: 10px; flex: 1; padding: 5px 14px; border-radius: 9px; background: color-mix(in srgb, var(--canvas) 8%, transparent); color: color-mix(in srgb, var(--canvas) 55%, var(--ink)); font: 500 28px/1.2 'Golos Text', sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pf-article .pf-src { font: 600 28px/1.2 'Golos Text', sans-serif; color: color-mix(in srgb, var(--canvas) 60%, var(--ink)); margin-bottom: 10px; }
.pf-article .pf-title { font: 700 40px/1.15 'Golos Text', sans-serif; margin-bottom: 14px; }
.pf-article .pf-quote { font: 400 40px/1.32 'Literata Variable', serif; }
.pf-article .pf-w { position: relative; display: inline-block; z-index: 0; }
.pf-article .pf-w::before { content: ''; position: absolute; left: -3px; right: -3px; top: 10%; bottom: 4%; background: var(--signal-2); opacity: .75; z-index: -1; transform: scaleX(var(--m, 0)); transform-origin: 0 50%; }
/* снимок страницы в окне: серая строка заголовка, три кнопки слева, имя сайта по центру; страница — снимок как есть */
.pf-article.shot { padding: 0; overflow: hidden; background: #fff; border-radius: 20px; box-shadow: 0 24px 64px rgba(0,0,0,.6), 0 0 0 1px rgba(0,0,0,.25); }
.pf-article.shot .pf-win { position: relative; height: 54px; display: flex; align-items: center; gap: 10px; padding: 0 20px; background: linear-gradient(#ecebed, #dcdbde); border-bottom: 1px solid #c6c5c9; }
.pf-article.shot .pf-win i { width: 18px; height: 18px; border-radius: 50%; background: #ff5f57; box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); }
.pf-article.shot .pf-win i:nth-child(2) { background: #febc2e; } .pf-article.shot .pf-win i:nth-child(3) { background: #28c840; }
.pf-article.shot .pf-win span { position: absolute; left: 0; right: 0; text-align: center; font: 600 28px/1 'Golos Text', sans-serif; color: #4a4a4f; }
.pf-article.shot .pf-view { position: relative; overflow: hidden; background: #fff; }
.pf-article.shot .pf-page { position: absolute; left: 0; top: 0; width: 100%; }
.pf-article.shot .pf-page img { display: block; width: 100%; height: auto; }
.pf-article.shot .pf-page .sep { display: block; height: 18px; background: repeating-linear-gradient(90deg, #ddd 0 10px, transparent 10px 20px) center / 100% 2px no-repeat; }
.pf-article.shot .hl { position: absolute; background: var(--signal-2); opacity: .55; mix-blend-mode: multiply; transform-origin: 0 50%; transform: scaleX(0); border-radius: 4px; }
.pf-race { box-sizing: border-box; padding: 26px 30px 22px; border-radius: var(--r-medium, 24px); background: color-mix(in srgb, var(--canvas) 80%, transparent); box-shadow: 0 22px 60px rgba(0,0,0,.5); }
.pf-race .rc-title { margin-bottom: 8px; font: 700 72px/1.05 Oswald, sans-serif; text-transform: uppercase; color: var(--ink); }
.pf-race .rc-row { display: flex; align-items: center; gap: 16px; height: 150px; }
.pf-race .rc-l { flex: none; width: 210px; font: 700 66px/1 Oswald, sans-serif; text-transform: uppercase; color: var(--ink); white-space: nowrap; }
.pf-race .rc-track { position: relative; flex: 1; height: 26px; border-radius: 13px; overflow: hidden; background: color-mix(in srgb, var(--ink) 12%, transparent); }
/* день → ночь: от жёлтого через оранжевый к фиолетовому */
.pf-race .rc-fill { position: absolute; left: 0; top: 0; width: 100%; height: 26px; background: linear-gradient(90deg, var(--signal-2) 0%, var(--signal) 55%, color-mix(in srgb, var(--signal) 45%, #4b2a7a) 80%, #4b2a7a 100%); transform-origin: 0 50%; transform: scaleX(0); }
.pf-race .rc-sun, .pf-race .rc-moon { flex: none; width: 76px; height: 76px; }
.pf-race .rc-moon { opacity: .25; }
/* подпись строки — плашка в конце своей строки, после дорожки; у строк без подписи — невидимая заглушка той же ширины */
.pf-race .rc-tag { flex: none; padding: 6px 12px 8px; border-radius: var(--r-small, 10px); background: var(--signal); color: var(--canvas); font: 700 40px/1 Oswald, sans-serif; text-transform: uppercase; white-space: nowrap; }
.pf-race .rc-tag.ghost { visibility: hidden; }
.pf-dim { position: absolute; left: 0; top: 0; background: rgba(8,6,14,.72); visibility: hidden; pointer-events: none; }
.pf-ring { box-sizing: border-box; border: 8px solid var(--signal); border-radius: 50%; box-shadow: 0 0 24px rgba(0,0,0,.4); }
.pf-box { box-sizing: border-box; border: 6px solid var(--signal); border-radius: var(--r-small, 10px); box-shadow: 0 0 18px rgba(0,0,0,.35); }
.pf-measure { height: 8px; transform-origin: 0 50%; }
.pf-measure .ln { position: absolute; left: 0; top: 0; width: 100%; height: 8px; border-radius: 4px; background: var(--signal); box-shadow: 0 0 14px rgba(0,0,0,.45); transform-origin: 0 50%; }
.pf-measure .tk { position: absolute; top: -20px; width: 8px; height: 48px; border-radius: 4px; background: var(--signal); }
.pf-measure .tk.a { left: 0; } .pf-measure .tk.b { left: 100%; margin-left: -8px; }
.pf-measure .pf-tag { left: 50%; top: -84px; }
.pf-road { left: 0; top: 0; overflow: hidden; }
.pf-road .rd-sky { position: absolute; inset: 0; background: linear-gradient(180deg, var(--canvas) 0%, color-mix(in srgb, var(--signal) 45%, var(--canvas)) 30%, var(--signal) 48%, var(--signal-2) 60%, color-mix(in srgb, var(--signal-2) 60%, #fff) 64%, var(--surface) 64.1%); }
.pf-road .rd-sun { position: absolute; left: 36%; top: 51%; width: 28%; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle, #fff 0 35%, var(--signal-2) 55%, transparent 72%); }
.pf-road .rd-world { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; perspective: 1100px; perspective-origin: 50% 54%; overflow: hidden; transform-origin: 0 0; }
.pf-road .rd-plane { position: absolute; left: -760px; top: -2000px; width: 2600px; height: 4400px; transform-origin: 50% 100%; transform-style: preserve-3d; background: var(--surface); }
.pf-road .rd-road { position: absolute; top: 0; height: 100%; background: color-mix(in srgb, var(--ink) 18%, var(--surface)); box-shadow: inset 0 0 0 10px color-mix(in srgb, var(--ink) 75%, transparent); }
.pf-road .rd-lane { position: absolute; left: calc(50% - 7px); top: 0; width: 14px; height: 100%; background: repeating-linear-gradient(180deg, var(--signal-2) 0 120px, transparent 120px 240px); }
.pf-road .rd-walk { position: absolute; top: 0; width: 120px; height: 100%; background: color-mix(in srgb, var(--ink) 30%, var(--surface)); }
.pf-road .rd-b { position: absolute; transform-style: preserve-3d; }
.pf-road .rd-b i { position: absolute; display: block; backface-visibility: visible; }
.pf-road .rd-b .roof { left: 0; top: 0; width: 100%; height: 100%; background: color-mix(in srgb, var(--c) 70%, #000); box-shadow: inset 0 0 0 6px rgba(255,255,255,.08); }
.pf-road .rd-b .front { left: 0; bottom: 0; width: 100%; transform-origin: 50% 100%; transform: rotateX(-90deg);
  background: repeating-linear-gradient(90deg, transparent 0 26px, color-mix(in srgb, var(--signal-2) 85%, transparent) 26px 52px, transparent 52px 78px), repeating-linear-gradient(0deg, var(--c) 0 34px, color-mix(in srgb, var(--c) 80%, #000) 34px 70px); background-blend-mode: multiply; }
.pf-road .rd-b .side { top: 0; height: 100%; background: color-mix(in srgb, var(--c) 85%, #000); }
.pf-road .rd-b.L .side { left: 100%; transform-origin: 0 50%; transform: rotateY(-90deg); }
.pf-road .rd-b.R .side { right: 100%; transform-origin: 100% 50%; transform: rotateY(90deg); }
.pf-road .rd-car { position: absolute; top: 3500px; width: 140px; height: 250px; transform-style: preserve-3d; }
.pf-road .rd-car .body { position: absolute; left: 0; top: 0; width: 140px; height: 250px; background: var(--ink); border-radius: 26px; transform: translateZ(40px); }
.pf-road .rd-car .cab { position: absolute; left: 18px; top: 70px; width: 104px; height: 110px; background: var(--surface); border-radius: 18px; transform: translateZ(78px); }
.pf-road .rd-ms { position: absolute; top: 3150px; height: 12px; transform: translateZ(6px); }
.pf-road .rd-ms .ln { position: absolute; left: 0; top: 0; width: 100%; height: 12px; background: var(--signal); border-radius: 6px; transform-origin: 0 50%; }
.pf-road .rd-ms .tk { position: absolute; top: -34px; width: 12px; height: 80px; background: var(--signal); border-radius: 6px; }
.pf-road .rd-ms .tk.a { left: 0; } .pf-road .rd-ms .tk.b { right: 0; }
.pf-road .rd-lab { position: absolute; left: 0; top: 17%; width: 100%; text-align: center; font: 700 96px/1 Oswald, sans-serif; text-transform: uppercase; color: var(--ink); text-shadow: 0 6px 30px rgba(0,0,0,.7); opacity: 0; }
.pf-light.flash { mix-blend-mode: normal; background: radial-gradient(70% 55% at 50% 50%, #fff 0%, rgba(255,255,255,.9) 55%, rgba(235,235,240,.75) 100%); }
.pf-light { position: absolute; inset: 0; overflow: hidden; mix-blend-mode: screen; pointer-events: none; visibility: hidden; }
.pf-light i { position: absolute; top: -10%; height: 120%; filter: blur(1.2px);
  background: linear-gradient(90deg, transparent 0, color-mix(in srgb, var(--signal-2) 55%, transparent) 22%, color-mix(in srgb, var(--signal-2) 30%, #fff) 44%, #fff 50%, color-mix(in srgb, var(--signal-2) 30%, #fff) 56%, color-mix(in srgb, var(--signal-2) 55%, transparent) 78%, transparent 100%); }
`;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
const SUN = '<circle cx="32" cy="32" r="16" fill="var(--signal-2)"/><g stroke="var(--signal-2)" stroke-width="5" stroke-linecap="round">'
  + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => { const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180); return `<line x1="${32 + 22 * c}" y1="${32 + 22 * s}" x2="${32 + 29 * c}" y2="${32 + 29 * s}"/>`; }).join('') + '</g>';
const MOON = '<path d="M40 8a24 24 0 1 0 16 40A20 20 0 0 1 40 8z" fill="var(--ink)"/>';

// Уголки прицела: четыре L по углам рамки; длина — 22 % короткой стороны, от 26 до 64 px.
const CORNERS = '<i class="pf-cn tl"></i><i class="pf-cn tr"></i><i class="pf-cn bl"></i><i class="pf-cn br"></i>';
export const cornerSize = (w, h) => Math.round(clamp(0.22 * Math.min(w, h), 26, 64));
const WARN = '<svg viewBox="0 0 64 64"><path d="M32 7 60 56H4z" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round"/>'
  + '<rect x="29" y="24" width="6" height="17" rx="3" fill="#fff"/><circle cx="32" cy="48" r="3.6" fill="#fff"/></svg>';
const BELL = '<svg viewBox="0 0 48 48"><path d="M24 5c-7.7 0-13 6-13 13.5v9L6.5 34v3h35v-3L37 27.5v-9C37 11 31.7 5 24 5z" fill="currentColor"/>'
  + '<path d="M18.5 40a5.5 5.5 0 0 0 11 0z" fill="currentColor"/></svg>';
const CURSOR = '<svg class="ck-cur" viewBox="0 0 64 80"><path d="M6 4v60l15-14 10 24 11-5-10-23h21z" fill="#fff" stroke="#111" stroke-width="4" stroke-linejoin="round"/></svg>';

function injectCss() {
  if (document.getElementById('pf-css')) return;
  const st = document.createElement('style');
  st.id = 'pf-css';
  st.textContent = CSS;
  document.head.append(st);
}

// box — контейнер слоя; videos — film.videos с элементами {id, el}; W, H — размер кадра.
// Видео карточки живёт в film.videos (рендер перематывает только <video> прямо в корне композиции):
// render ставит его в прямоугольник рамки, подрезает до crop и двигает вместе с карточкой.
export async function mountProofs({box, list = [], W, H, duration, videos = [], captions = [], captionTop = null}) {
  validateProofs(list, {duration, videos, W, H});
  injectCss();
  const frame = {W, H};
  const byId = new Map(videos.map((v) => [v.id, v]));
  const items = list.map((p0, i) => {
    const p = resolveProof(p0);
    const el = document.createElement('div');
    el.className = `pf pf-${p.kind}`;
    el.id = `pf${i}`;
    const it = {p, el, end: proofEnd(p)};
    const place = (cx, cy, w, h) => Object.assign(el.style, {left: `${cx - w / 2}px`, top: `${cy - (h ?? 0) / 2}px`, width: `${w}px`, ...(h ? {height: `${h}px`} : {})});
    if (p.kind === 'logo') {
      const w = (p.w ?? 0.31) * W;
      el.innerHTML = `<img src="${esc(p.src)}" alt="">`;
      Object.assign(el.style, {left: `${(p.x ?? 0.5) * W - w / 2}px`, top: `${(p.y ?? 0.2) * H}px`, width: `${w}px`});
    } else if (p.kind === 'card') {
      // крупно по умолчанию: почти во всю рабочую ширину
      const g = p.zoom ? zoomGeom(p) : p;
      const w = (g.w ?? 0.8) * W;
      const h = g.h ? g.h * H : p.video ? Math.round(w * 9 / 16) : null;
      const light = p.border === 'ink' ? 'light' : '';
      const mark = p.mark ? `<div class="pf-mark" style="left:${p.mark[0] * 100}%;top:${p.mark[1] * 100}%;width:${p.mark[2] * 100}%;height:${p.mark[3] * 100}%"></div>` : '';
      const frameHtml = p.video ? `<div class="pf-frame video ${light}">${mark}</div>`
        : `<div class="pf-frame ${light}"><div class="pf-in"><img src="${esc(p.src)}" alt=""></div>${mark}</div>`;
      el.innerHTML = `${frameHtml}${p.label ? `<div class="pf-label">${esc(p.label)}</div>` : ''}${p.zoom ? CORNERS : ''}`;
      if (p.zoom) { el.classList.add('zoom'); el.style.setProperty('--cn', `${cornerSize(w, h)}px`); }
      place((g.x ?? 0.5) * W, (g.y ?? 0.3) * H, w, h);
      it.frame = el.querySelector('.pf-frame');
      it.inner = el.querySelector('.pf-in');
      it.img = el.querySelector('img');
      it.mark = el.querySelector('.pf-mark');
      if (p.video) it.video = byId.get(p.video);
      if (p.blurBg) it.blur = byId.get(p.blurBg);
    } else if (p.kind === 'article' && p.shot) {
      const g = shotGeom(p, frame);
      el.classList.add('shot');
      const head = p.shotHead ? `<img src="${esc(p.shotHead)}" alt=""><i class="sep"></i>` : '';
      el.innerHTML = `<div class="pf-win" data-layout-ignore><i></i><i></i><i></i><span>${esc(p.title ?? p.source ?? '')}</span></div>
        <div class="pf-view" style="height:${g.vh}px" data-layout-ignore><div class="pf-page">${head}<img src="${esc(p.shot)}" alt="">`
        + g.lines.map((r) => `<i class="hl" style="left:${r[0] - 4}px;top:${r[1]}px;width:${r[2] + 8}px;height:${r[3]}px"></i>`).join('') + '</div></div>';
      Object.assign(el.style, {left: `${(p.x ?? 0.5) * W - g.w / 2}px`, top: `${(p.y ?? 0.17) * H}px`, width: `${g.w}px`});
      it.page = el.querySelector('.pf-page');
      it.hls = [...el.querySelectorAll('.hl')];
    } else if (p.kind === 'article') {
      const words = String(p.quote).trim().split(/\s+/);
      const w = (p.w ?? 0.89) * W;
      el.innerHTML = `<div class="pf-bar" data-layout-ignore><i></i><i></i><i></i><span>${esc(p.url ?? '')}</span></div>
        ${p.source || p.author || p.date ? `<div class="pf-src">${[p.source, p.author, p.date].filter(Boolean).map(esc).join(' · ')}</div>` : ''}
        ${p.title ? `<div class="pf-title">${esc(p.title)}</div>` : ''}
        <div class="pf-quote">${words.map((x, j) => `<span class="pf-w" data-j="${j}">${esc(x)}</span>`).join(' ')}</div>`;
      Object.assign(el.style, {left: `${(p.x ?? 0.5) * W - w / 2}px`, top: `${(p.y ?? 0.17) * H}px`, width: `${w}px`});
      const span = markSpan(p);
      it.marks = [...el.querySelectorAll('.pf-w')].slice(span.from, span.to + 1);
    } else if (p.kind === 'race') {
      const w = (p.w ?? 0.83) * W;
      const longest = p.rows.map((r) => r.tag ?? '').reduce((a, b) => (b.length > a.length ? b : a), '');
      el.innerHTML = (p.title ? `<div class="rc-title">${esc(p.title)}</div>` : '')
        + p.rows.map((r) => `<div class="rc-row"><div class="rc-l">${esc(r.label)}</div><svg class="rc-sun" viewBox="0 0 64 64">${SUN}</svg>`
          + `<div class="rc-track"><i class="rc-fill"></i></div><svg class="rc-moon" viewBox="0 0 64 64">${MOON}</svg>`
          + (r.tag ? `<div class="rc-tag">${esc(r.tag)}</div>` : longest ? `<div class="rc-tag ghost" aria-hidden="true">${esc(longest)}</div>` : '') + '</div>').join('');
      Object.assign(el.style, {left: `${(p.x ?? 0.5) * W - w / 2}px`, top: `${(p.y ?? 0.4) * H}px`, width: `${w}px`});
      it.fills = [...el.querySelectorAll('.rc-fill')];
      it.suns = [...el.querySelectorAll('.rc-sun')];
      it.moons = [...el.querySelectorAll('.rc-moon')];
    } else if (p.kind === 'ring') {
      const r = (p.r ?? 0.08) * W;
      place(p.c[0] * W, p.c[1] * H, 2 * r, 2 * r);
    } else if (p.kind === 'box') {
      if (p.label) el.innerHTML = `<div class="pf-tag">${esc(p.label)}</div>`;
      if (p.look === 'corners') { el.classList.add('corners'); el.insertAdjacentHTML('beforeend', CORNERS); }
    } else if (p.kind === 'title') {
      // строка во всю ширину кадра, центр текста — x; размер — size в px кадра 1080 (по умолчанию 132)
      el.textContent = String(p.text);
      Object.assign(el.style, {left: `${((p.x ?? 0.5) - 0.5) * W}px`, top: `${(p.y ?? 0.1) * H}px`, width: `${W}px`});
      el.style.setProperty('--fs', `${Math.round((p.size ?? 132) * W / 1080)}px`);
    } else if (p.kind === 'alert') {
      const [ix, iy] = p.c ?? [0.8, 0.22], d = Math.round((p.r ?? 0.045) * 2 * W);
      Object.assign(el.style, {left: '0px', top: '0px', width: `${W}px`, height: `${H}px`});
      el.innerHTML = `${p.edge === false ? '' : '<i class="al-edge"></i>'}<div class="al-ic" style="left:${ix * W - d / 2}px;top:${iy * H - d / 2}px;--ic:${d}px">${WARN}</div>`;
      it.edge = el.querySelector('.al-edge');
      it.icon = el.querySelector('.al-ic');
    } else if (p.kind === 'click') {
      Object.assign(el.style, {left: `${(p.x ?? 0.5) * W}px`, top: `${(p.y ?? 0.42) * H}px`});
      el.innerHTML = `<i class="ck-ring"></i><div class="ck-pill"><span class="a">${esc(p.label ?? 'Подписаться')}</span>`
        + `<span class="b">${BELL}${esc(p.done ?? 'Вы подписаны')}</span></div>${CURSOR}`;
      it.pill = el.querySelector('.ck-pill');
      it.sa = el.querySelector('.ck-pill .a');
      it.sb = el.querySelector('.ck-pill .b');
      it.ring = el.querySelector('.ck-ring');
      it.cur = el.querySelector('.ck-cur');
    } else if (p.kind === 'measure') {
      const [ax, ay] = [p.a[0] * W, p.a[1] * H], [bx, by] = [p.b[0] * W, p.b[1] * H];
      const len = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
      Object.assign(el.style, {left: `${ax}px`, top: `${ay - 4}px`, width: `${len}px`, transform: `rotate(${ang}deg)`});
      el.innerHTML = `<i class="ln"></i><i class="tk a"></i><i class="tk b"></i>${p.label ? `<div class="pf-tag t0">${esc(p.label)}</div>` : ''}${p.stretch?.label ? `<div class="pf-tag t1">${esc(p.stretch.label)}</div>` : ''}`;
      it.ln = el.querySelector('.ln');
      it.ticks = el.querySelectorAll('.tk');
      it.tag = el.querySelector('.t0');
      it.tag1 = el.querySelector('.t1');
      it.tagAngle = -ang;
    } else if (p.kind === 'road') {
      const tones = ['var(--surface)', 'var(--line)', 'color-mix(in srgb, var(--signal) 35%, var(--surface))', 'color-mix(in srgb, var(--muted) 40%, var(--surface))'];
      const blds = roadBuildings(p.seed);
      Object.assign(el.style, {width: `${W}px`, height: `${H}px`});
      el.innerHTML = `<div class="rd-sky"><i class="rd-sun"></i></div><div class="rd-world" style="transform:scale(${W / 1080})"><div class="rd-plane">
        <div class="rd-road"><i class="rd-lane"></i></div><i class="rd-walk L"></i><i class="rd-walk R"></i>
        ${blds.map((b, j) => `<div class="rd-b ${b.side ? 'R' : 'L'}${b.extra ? ' x' : ''}" data-j="${j}" style="top:${b.y}px;width:${b.w}px;height:${b.d}px;--c:${tones[b.tone]}"><i class="roof" style="transform:translateZ(${b.h}px)"></i><i class="front" style="height:${b.h}px"></i><i class="side" style="width:${b.h}px"></i></div>`).join('')}
        <div class="rd-car"><i class="body"></i><i class="cab"></i></div>
        <div class="rd-ms"><i class="ln"></i><i class="tk a"></i><i class="tk b"></i></div>
      </div></div>${(p.labels ?? []).slice(0, 2).map((l, j) => `<div class="rd-lab a${j}">${esc(l)}</div>`).join('')}`;
      it.plane = el.querySelector('.rd-plane');
      it.road = el.querySelector('.rd-road');
      it.lane = el.querySelector('.rd-lane');
      it.walks = [...el.querySelectorAll('.rd-walk')];
      it.blds = [...el.querySelectorAll('.rd-b')].map((e, j) => ({e, ...blds[j]}));
      it.extra = it.blds.filter((b) => b.extra);
      it.car = el.querySelector('.rd-car');
      it.ms = el.querySelector('.rd-ms');
      it.msLn = el.querySelector('.rd-ms .ln');
      it.labs = [...el.querySelectorAll('.rd-lab')];
    }
    if (p.backdrop) {
      it.dim = document.createElement('div');
      it.dim.className = 'pf-dim';
      it.dim.dataset.layoutIgnore = '';
      Object.assign(it.dim.style, {width: `${W}px`, height: `${H}px`});
      box.append(it.dim);
    }
    box.append(el);
    return it;
  });
  await Promise.all([...box.querySelectorAll('img')].map((img) => img.decode().catch(() => {})));
  // Карточка с картинкой без h: высоту знаем только после загрузки — ставим центр карточки в y.
  for (const it of items) if (it.p.kind === 'card' && !it.p.h && !it.p.video) {
    it.el.style.top = `${(it.p.y ?? 0.3) * H - it.el.offsetHeight / 2}px`;
  }
  for (const it of items) if (it.pill) {
    const w = it.pill.offsetWidth, h = it.pill.offsetHeight;
    Object.assign(it.ring.style, {width: `${w}px`, height: `${h}px`, left: `${-w / 2}px`, top: `${-h / 2}px`});
  }
  checkCaptionZone(items, {W, H, captions, captionTop});
  // Прямоугольник рамки карточки с видео — для самого <video> (внутри рамки толщиной 6 px).
  for (const it of items) if (it.video) {
    const r = it.frame.getBoundingClientRect(), b = it.p.zoom ? 0 : 6;
    it.vrect = {left: parseFloat(it.el.style.left) + b, top: parseFloat(it.el.style.top) + b, width: r.width - 2 * b, height: r.height - 2 * b};
    it.center = [parseFloat(it.el.style.left) + r.width / 2, parseFloat(it.el.style.top) + r.height / 2];
  }

  // Улица при ширине дороги rw: дорога, тротуары, дома, машина и замер стоят от её краёв (плоскость 2600 px шириной).
  const layoutRoad = (it, rw) => {
    const c = 1300;
    Object.assign(it.road.style, {left: `${c - rw / 2}px`, width: `${rw}px`});
    it.walks[0].style.left = `${c - rw / 2 - 120}px`;
    it.walks[1].style.left = `${c + rw / 2}px`;
    for (const b of it.blds) b.e.style.left = `${b.side ? c + rw / 2 + 140 : c - rw / 2 - 140 - b.w}px`;
    it.car.style.left = `${c + rw / 4 - 70}px`;
    Object.assign(it.ms.style, {left: `${c - rw / 2}px`, width: `${rw}px`});
  };

  return function render(t) {
    for (const it of items) {
      const s = proofState(it.p, t, frame);
      it.el.style.visibility = s.on ? 'inherit' : 'hidden';
      if (it.dim) { it.dim.style.visibility = s.on ? 'inherit' : 'hidden'; it.dim.style.opacity = (s.dim ?? 0).toFixed(3); }
      if (it.video) it.video.el.style.opacity = 0;
      if (it.blur) it.blur.el.style.opacity = 0;
      if (!s.on) continue;
      it.el.style.opacity = s.opacity.toFixed(3);
      const {p} = it;
      if (['logo', 'card', 'article', 'race'].includes(p.kind)) {
        const tr = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) rotate(${s.rot.toFixed(2)}deg) scale(${s.scale.toFixed(4)})`;
        it.el.style.transform = tr;
        if (it.marks) it.marks.forEach((m, j) => m.style.setProperty('--m', s.marks[j].toFixed(3)));
        if (it.page) {
          it.page.style.transform = `translateY(${(-s.scroll).toFixed(1)}px)`;
          it.hls.forEach((h, j) => { h.style.transform = `scaleX(${s.lines[j].toFixed(3)})`; });
        }
        if (it.fills) s.rows.forEach((r, j) => {
          it.fills[j].style.transform = `scaleX(${r.fill.toFixed(4)})`;
          it.suns[j].style.opacity = r.sun.toFixed(3);
          it.moons[j].style.opacity = r.moon.toFixed(3);
          it.moons[j].style.transform = `scale(${r.moonScale.toFixed(4)})`;
        });
        if (p.kind === 'card') {
          const bad = s.bad ?? 0;
          it.frame.style.borderColor = bad > 0 ? `color-mix(in srgb, var(--bad) ${(bad * 100).toFixed(1)}%, ${p.border === 'ink' ? 'var(--ink)' : 'var(--signal)'})` : '';
          const fx = bad > 0 ? `grayscale(${bad.toFixed(3)}) brightness(${(1 - 0.2 * bad).toFixed(3)})` : 'none';
          if (it.mark) { it.mark.style.opacity = s.mark.toFixed(3); it.mark.style.transform = `scale(${s.markScale.toFixed(4)})`; }
          if (it.inner) {
            it.inner.style.transform = `translateX(${s.pushX.toFixed(2)}%) scale(${s.push.toFixed(4)})`;
            it.img.style.filter = fx;
          }
          if (it.video) {
            // кусок кадра (crop) во всю рамку и наезд: видео больше рамки, лишнее срезает clip-path, движется вместе с карточкой
            const v = it.video.el, r = it.vrect, [cx, cy, cw, ch] = p.crop ?? [0, 0, 1, 1];
            const vw = r.width / cw * s.push, vh = r.height / ch * s.push;
            const left = r.left + r.width / 2 - (cx + cw / 2) * vw + (s.pushX / 100) * r.width;
            const top = r.top + r.height / 2 - (cy + ch / 2) * vh;
            const ins = [r.top - top, left + vw - (r.left + r.width), top + vh - (r.top + r.height), r.left - left].map((x) => `${x.toFixed(1)}px`).join(' ');
            Object.assign(v.style, {inset: 'auto', left: `${left.toFixed(1)}px`, top: `${top.toFixed(1)}px`, width: `${vw.toFixed(1)}px`, height: `${vh.toFixed(1)}px`,
              objectFit: 'fill', clipPath: `inset(${ins} round ${p.zoom ? 6 : 18}px)`, transformOrigin: `${(it.center[0] - left).toFixed(1)}px ${(it.center[1] - top).toFixed(1)}px`,
              transform: tr, filter: fx, opacity: s.opacity.toFixed(3)});
          }
          if (it.blur) {
            Object.assign(it.blur.el.style, {inset: '0', width: `${W}px`, height: `${H}px`, objectFit: 'cover', transform: 'scale(1.15)',
              filter: 'blur(36px) brightness(.7)', opacity: (s.k * s.out).toFixed(3)});
          }
        }
      } else if (p.kind === 'ring') {
        it.el.style.transform = `scale(${s.scale.toFixed(4)})`;
      } else if (p.kind === 'title') {
        it.el.style.transform = `scale(${s.scale.toFixed(4)})`;
        it.el.style.filter = s.blur > 0.3 ? `blur(${s.blur.toFixed(1)}px)` : 'none';
      } else if (p.kind === 'alert') {
        if (it.edge) it.edge.style.opacity = s.edge.toFixed(3);
        it.icon.style.opacity = s.icon.toFixed(3);
        it.icon.style.transform = `scale(${s.iconScale.toFixed(4)})`;
      } else if (p.kind === 'click') {
        it.pill.style.transform = `translate(-50%, -50%) translateY(${s.y.toFixed(1)}px) scale(${(s.scale * s.press).toFixed(4)})`;
        it.sa.style.opacity = (1 - s.swap).toFixed(3);
        it.sb.style.opacity = s.swap.toFixed(3);
        it.ring.style.visibility = s.ring.on ? 'inherit' : 'hidden';
        it.ring.style.opacity = s.ring.opacity.toFixed(3);
        it.ring.style.transform = `translateY(${s.y.toFixed(1)}px) scale(${s.ring.scale.toFixed(4)})`;
        it.cur.style.opacity = s.cur.opacity.toFixed(3);
        it.cur.style.transform = `translate(${s.cur.x.toFixed(1)}px, ${(s.cur.y + s.y).toFixed(1)}px) scale(${s.press.toFixed(4)})`;
      } else if (p.kind === 'box') {
        const [x, y, w, h] = s.rect;
        if (p.look === 'corners') it.el.style.setProperty('--cn', `${cornerSize(w * W, h * H)}px`);
        Object.assign(it.el.style, {left: `${(x * W).toFixed(1)}px`, top: `${(y * H).toFixed(1)}px`, width: `${(w * W).toFixed(1)}px`, height: `${(h * H).toFixed(1)}px`,
          transform: `scale(${s.scale.toFixed(4)})`});
      } else if (p.kind === 'measure') {
        it.ln.style.transform = `scaleX(${(s.line * s.stretch).toFixed(4)})`;
        it.ticks[0].style.opacity = s.tickA.toFixed(3);
        it.ticks[1].style.opacity = s.tickB.toFixed(3);
        it.ticks[1].style.left = `${(100 * s.stretch).toFixed(2)}%`;
        if (it.tag) {
          it.tag.style.opacity = s.tag.toFixed(3);
          it.tag.style.transform = `translateX(-50%) rotate(${it.tagAngle.toFixed(2)}deg) translateY(${((1 - Math.min(1, s.tag)) * 12).toFixed(1)}px)`;
        }
        if (it.tag1) {
          it.tag1.style.opacity = s.tag1.toFixed(3);
          it.tag1.style.left = `${(50 * (s.stretchK ?? 1)).toFixed(2)}%`;
          it.tag1.style.transform = `translateX(-50%) rotate(${it.tagAngle.toFixed(2)}deg) translateY(${((1 - s.tag1) * 12).toFixed(1)}px)`;
        }
      } else if (p.kind === 'road') {
        layoutRoad(it, s.rw);
        it.lane.style.backgroundPosition = `0 ${s.lane.toFixed(1)}px`;
        it.plane.style.transform = `translateY(${s.cam.y.toFixed(1)}px) scale(${s.cam.s.toFixed(4)}) rotateX(${s.cam.rx.toFixed(2)}deg)`;
        it.extra.forEach((b, j) => { b.e.style.transform = `scaleZ(${s.grow ? Math.max(0.001, s.grow[j]).toFixed(4) : 0.001})`; });
        it.msLn.style.transform = `scaleX(${s.measure.toFixed(4)})`;
        it.labs.forEach((l, j) => { l.style.opacity = s.labels[j].toFixed(3); l.style.transform = `translateY(${((1 - s.labels[j]) * 20).toFixed(1)}px)`; });
      }
    }
  };
}

// Вставки не заходят на подписи: прямоугольник вставки после посадки (без влёта, с ярлыком и запасом на дрейф) не
// пересекает блок подписи, который на экране в то же время, и не опускается ниже captionTop (px), если он задан.
// Схема дороги — во весь кадр, подписи поверх неё задуманы. Ошибка называет вставку, подпись и заход в пикселях.
export function overlapsCaptions(proofs, caps, captionTop = null) {
  const bad = [];
  for (const pr of proofs) {
    if (captionTop !== null && pr.rect.bottom > captionTop + 1) bad.push(`${pr.what}: низ на ${Math.round(pr.rect.bottom)} px, зона подписей с ${Math.round(captionTop)} px`);
    for (const c of caps) {
      if (c.to <= pr.at || c.from >= pr.end) continue;
      const dx = Math.min(pr.rect.right, c.rect.right) - Math.max(pr.rect.left, c.rect.left);
      const dy = Math.min(pr.rect.bottom, c.rect.bottom) - Math.max(pr.rect.top, c.rect.top);
      if (dx > 1 && dy > 1) bad.push(`${pr.what}: заходит на подпись «${c.text}» (${c.from}–${c.to} с) на ${Math.round(dy)} px по высоте`);
    }
  }
  return bad;
}

// Клик не дублирует подпись: пока кнопка на экране, подпись не повторяет её слово (проба 19.11: «subscribed 2 раза»).
// Слова сравниваются по первым пяти буквам: «Подпишись» и «Подписаться», «Subscribe» и «Subscribed» — одно слово.
const stem5 = (w) => String(w).toLowerCase().replace(/[^\p{L}\d]/gu, '').slice(0, 5);
export function clickDuplicates(list, caps) {
  const bad = [];
  list.forEach((p0, i) => {
    const p = resolveProof(p0);
    if (p?.kind !== 'click') return;
    const label = p.label ?? 'Подписаться', done = p.done ?? 'Вы подписаны';
    const keys = new Set(`${label} ${done}`.split(/\s+/).map(stem5).filter((w) => w.length >= 4));
    const end = proofEnd(p);
    const c = caps.find((x) => x.from < end && x.to > p.at && String(x.text).split(/\s+/).some((w) => keys.has(stem5(w))));
    if (c) bad.push(`proofs[${i}] (клик «${label}»): подпись «${c.text}» (${c.from}–${c.to} с) повторяет слово кнопки — убрать слово из фразы или клик`);
  });
  return bad;
}

function checkCaptionZone(items, {W, H, captions, captionTop}) {
  if (!captions.length && captionTop === null) return;
  const dup = clickDuplicates(items.map((it) => it.p), captions);
  if (dup.length) throw new Error('Клик и подпись говорят одно и то же:\n  ' + dup.join('\n  '));
  const proofs = [];
  for (const [i, it] of items.entries()) {
    const {p, el} = it;
    if (p.kind === 'road') continue;
    let rect;
    if (p.kind === 'measure') {
      const pts = [p.a, p.b, ...(p.stretch ? [p.stretch.b] : [])];
      const xs = pts.map((q) => q[0] * W), ys = pts.map((q) => q[1] * H);
      rect = {left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys) - 84, bottom: Math.max(...ys) + 24};
    } else if (p.kind === 'box') {
      const rs = (p.keys ?? [{rect: p.rect}]).map((k) => k.rect);
      rect = {left: Math.min(...rs.map((r) => r[0])) * W, right: Math.max(...rs.map((r) => r[0] + r[2])) * W,
        top: Math.min(...rs.map((r) => r[1])) * H - (p.label ? 60 : 0), bottom: Math.max(...rs.map((r) => r[1] + r[3])) * H};
    } else if (p.kind === 'alert' || p.kind === 'click') {
      // тревога — во весь кадр, проверяется только значок; клик — кнопка с запасом на кольцо
      const r = (it.icon ?? it.pill).getBoundingClientRect(), m = p.kind === 'click' ? 0.18 * r.height : 0;
      rect = {left: r.left - m, right: r.right + m, top: r.top - m, bottom: r.bottom + m + 24};
    } else {
      const saved = el.style.transform;
      el.style.transform = 'none';
      const r = el.getBoundingClientRect();
      const label = el.querySelector('.pf-label');
      const top = label ? Math.min(r.top, label.getBoundingClientRect().top) : r.top;
      el.style.transform = saved;
      rect = {left: r.left, right: r.right, top, bottom: r.bottom + (p.kind === 'article' ? 0 : 24)};
    }
    proofs.push({what: `proofs[${i}] (${p.kind})`, at: p.at, end: it.end, rect});
  }
  const caps = captions.map((c) => ({from: c.from, to: c.to, text: c.text, rect: c.el.getBoundingClientRect()}));
  const bad = overlapsCaptions(proofs, caps, captionTop);
  if (bad.length) throw new Error('Вставки заходят на подписи — поднять вставку, уменьшить или развести по времени:\n  ' + bad.join('\n  '));
}

// Переход «полоса света»: film.lightbars — моменты склеек (секунды или {at}). Слой над кадром, под подписями.
export function mountLightbars({box, list = [], W, H}) {
  injectCss();
  const bars = list.map((x) => (typeof x === 'number' ? {at: x} : x)).map(({at, kind}) => {
    const wrap = document.createElement('div');
    wrap.className = 'pf-light';
    if (kind === 'flash') {
      // вспышка: белая засветка от середины кадра, склейка под пиком
      wrap.classList.add('flash');
      box.append(wrap);
      return {at, wrap, flash: true};
    }
    wrap.dataset.layoutIgnore = '';
    const bw = 0.16 * W;
    wrap.innerHTML = `<i style="left:${W / 2 - bw / 2}px;width:${bw}px"></i>`;
    box.append(wrap);
    return {at, wrap, bar: wrap.firstChild};
  });
  return function render(t) {
    for (const b of bars) {
      if (b.flash) {
        const f = flashState(t, b.at);
        b.wrap.style.visibility = f > 0.002 ? 'inherit' : 'hidden';
        b.wrap.style.opacity = f.toFixed(3);
        continue;
      }
      const s = lightbarState(t, b.at, W);
      b.wrap.style.visibility = s.on ? 'inherit' : 'hidden';
      if (!s.on) continue;
      b.bar.style.opacity = s.opacity.toFixed(3);
      b.bar.style.transform = `translateX(${s.x.toFixed(1)}px) skewX(-8deg) scaleX(${s.sx.toFixed(3)})`;
    }
  };
}
