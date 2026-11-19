// Проверка словаря приёмов без браузера: node engine/lib/moves.test.mjs
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {ENTER, HOOK_LEAD, MOVES, VIAS, NATURAL, VIA_DUR, rise, resolveMove, resolveVia, timeline, totalDuration, stateAt, slicesAt, powerOffAt,
  parseBracketed, embargoAt, embargoLength, stripesAt, splitAt, carryPlan, changedColumns, carryAt, carryLength, hexCells, hexAt, timesAt,
  splitSegments, breakdownAt, spotlightAt, pleatsAt, parseKeys, keysPlan, keysAt, keysLength, promptPlan, promptAt, moveLength, naturalDur,
  validateMoves} from './moves.js';

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const steps = (from, to, step, fn) => { for (let u = from; u <= to + 1e-9; u += step) fn(u); };
const checked = new Set();   // приёмы и переходы, у которых ниже есть своя проверка

// ── слова ──
for (const [dict, resolve] of [[MOVES, resolveMove], [VIAS, resolveVia]]) {
  for (const [key, names] of Object.entries(dict)) {
    ok(resolve(key) === key, key);
    for (const name of names) ok(resolve(name) === key, name);
  }
  const all = Object.values(dict).flat();
  ok(new Set(all).size === all.length, 'русские имена уникальны');
}
ok(resolveMove('ЭМБАРГО') === 'embargo' && resolveMove('Соты ') === 'hex', 'регистр и пробелы');
assert.throws(() => resolveMove('единорог'), /Нет приёма/); n++;
assert.throws(() => resolveVia('шторка'), /Нет перехода/); n++;
ok(Object.keys(MOVES).every((k) => NATURAL[k] >= 2) && Object.keys(VIAS).every((k) => VIA_DUR[k] >= 0), 'у каждого слова есть длина');

// ── вход по правилу: 0,45 с, замедление, без перелёта ──
ok(ENTER === 0.45 && rise(-1) === 0 && rise(0.45) === 1 && rise(3) === 1, 'вход 0,45 с');
let prev = -1;
steps(0, 0.6, 0.01, (u) => { const k = rise(u); ok(k >= prev - 1e-9 && k <= 1, `вход без перелёта ${u.toFixed(2)}`); prev = k; });

// ── время и переходы ──
const film = [{move: 'титр', text: 'А', dur: 3}, {move: 'титр', text: 'Б', via: 'ленты', dur: 3}, {move: 'соты', value: 50, via: 'выключение', dur: 4}];
const tl = timeline(film);
ok(tl[1].start === 3 && tl[2].start === 6 && totalDuration(film) === 10, 'сцены подряд');
ok(tl[0].via === 'cut' && tl[1].via === 'bands' && tl[2].via === 'poweroff', 'переход — у входящей сцены, первая встык');
ok(timeline([{move: 'соты', value: 5}])[0].dur === NATURAL.hex, 'длина по умолчанию');
steps(0, 9.99, 0.05, (t) => {
  const st = stateAt(t, tl);
  const black = st.tr?.kind === 'poweroff';
  ok(st.scenes.some((s) => s.visible) || black, `кадр не пустой в ${t.toFixed(2)}`);
});
const mid = stateAt(1.5, tl);
ok(mid.scenes[0].visible && !mid.scenes[1].visible && mid.tr === null && near(mid.scenes[0].u, 1.5), 'середина сцены');
const seam = stateAt(3, tl);
ok(seam.tr.kind === 'bands' && near(seam.tr.p, 0.5) && seam.scenes[0].visible && seam.scenes[1].visible, 'ленты: на стыке видны обе сцены');
ok(near(seam.scenes[1].u, VIA_DUR.bands / 2), 'новая сцена приезжает уже собранной');
const off = stateAt(5.9, tl);
ok(off.tr.kind === 'poweroff' && off.tr.out === 1 && off.tr.in === -1 && !off.scenes[2].visible, 'выключение съедает хвост уходящей сцены');
ok(stateAt(6, tl).tr === null && stateAt(6, tl).scenes[2].visible, 'после выключения следующая сцена встык');
ok(stateAt(9.8, tl, {end: 'poweroff'}).tr.out === 2, 'выключение в конце ролика');
ok(near(stateAt(0, tl, {hook: HOOK_LEAD}).scenes[0].u, HOOK_LEAD) && near(stateAt(4, tl, {hook: HOOK_LEAD}).scenes[1].u, 1 + VIA_DUR.bands / 2), 'промотка только у первой сцены');
ok(JSON.stringify(stateAt(3.21, tl)) === JSON.stringify(stateAt(3.21, tl)), 'перемотка: тот же t — те же числа');
checked.add('title');

// Ленты и колонки: до перехода все части на старой сцене, после — на новой; соседние едут в разные стороны.
for (const count of [4, 5, 6, 8]) {
  ok(slicesAt(0, count).every((p) => p.e === 0) && slicesAt(1, count).every((p) => near(p.e, 1)), `части: края, ${count}`);
  ok(slicesAt(0.5, count).every((p, k) => p.dir === (k % 2 ? -1 : 1)), 'стороны чередуются');
  let last = slicesAt(0, count).map((p) => p.e);
  steps(0, 1, 0.02, (p) => { const cur = slicesAt(p, count).map((x) => x.e); ok(cur.every((e, k) => e >= last[k] - 1e-9), 'части не едут назад'); last = cur; });
  const half = slicesAt(0.5, count);
  ok(half[0].q > half.at(-1).q, 'части идут по очереди');
}
checked.add('bands'); checked.add('columns'); checked.add('cut');

// Выключение: сначала высота, потом ширина, в конце чёрный кадр.
ok(powerOffAt(0).sy === 1 && powerOffAt(0).sx === 1 && !powerOffAt(0).black && powerOffAt(0).line === 0, 'до выключения кадр цел');
ok(powerOffAt(0.6).sy < 0.01 && powerOffAt(0.6).sx === 1 && powerOffAt(0.6).line > 0.9, 'кадр сжат в строку');
ok(powerOffAt(0.82).sx === 0 && powerOffAt(0.82).dot > 0.9, 'строка сжата в точку');
ok(powerOffAt(1).dot === 0 && powerOffAt(1).line === 0 && powerOffAt(1).black, 'точка погасла');
prev = 2;
steps(0, 1, 0.02, (p) => { const s = powerOffAt(p); ok(s.sy <= prev + 1e-9 && s.gain >= 1, 'сжатие в одну сторону'); prev = s.sy; });
checked.add('poweroff');

// ── типографика ──
ok(JSON.stringify(parseBracketed('Запуск [сегодня], и [бесплатно].')) === JSON.stringify([{text: 'Запуск ', hidden: false}, {text: 'сегодня', hidden: true}, {text: ', и ', hidden: false}, {text: 'бесплатно', hidden: true}, {text: '.', hidden: false}]), 'скобки → плашки');
ok(embargoAt(1, 3).bars.every((k) => k === 0) && embargoAt(1, 3).slug === 0, 'эмбарго: до снятия всё закрыто');
ok(embargoAt(embargoLength(3), 3).bars.every((k) => k === 1) && embargoAt(9, 3).slug === 1, 'эмбарго: в конце всё открыто');
steps(0, 5, 0.05, (u) => { const b = embargoAt(u, 4).bars; ok(b.every((k, i) => i === 0 || k <= b[i - 1] + 1e-9), 'плашки уходят по одной, по порядку'); });
ok(embargoAt(2.2, 3).slug > 0 && embargoAt(2.2, 3).bars[0] === 0, 'сначала меняется подпись, потом уходят плашки');
checked.add('embargo');

steps(0, 4, 0.05, (u) => {
  const s = stripesAt(u).stripes;
  ok(s.every((x) => x.b > x.a) && s[1].a >= s[0].b - 1e-9 && s[2].a >= s[1].b - 1e-9, `полосы не пересекаются ${u.toFixed(2)}`);
});
ok(stripesAt(0).stripes.every((x) => x.b <= 0) && !stripesAt(0).plain, 'полосы: в начале кадр пуст');
const slab = stripesAt(2);
ok(near(slab.stripes[0].b, slab.stripes[1].a) && near(slab.stripes[1].b, slab.stripes[2].a) && slab.stripes[2].b > 0.98 && slab.plain && slab.band === 0, 'полосы сходятся в сплошную плашку');
const parked = stripesAt(4, {park: 0.3});
ok(parked.stripes.every((x) => x.b < 0.3 && x.b - x.a < 0.02) && parked.band === 1 && parked.plain, 'полосы встают штрихами слева от текста');
checked.add('stripes');

ok(splitAt(0.9).gap === 0 && splitAt(0.9).beam > 0.9 && splitAt(0.9).inner === 0, 'разлом: луч проходит до раскрытия');
ok(near(splitAt(2).gap, 1) && splitAt(2).inner === 1, 'разлом раскрыт, вторая фраза видна');
ok(near(splitAt(9).gap, 0.6) && near(splitAt(9).scale, 0.76), 'щель сужается и остаётся');
steps(0, 6, 0.05, (u) => { const s = splitAt(u); ok(s.gap >= 0 && s.gap <= 1 && (s.inner === 0 || s.gap > 0.4), 'вторая фраза только в открытой щели'); });
checked.add('split');

// ── числа ──
const plan = carryPlan(2855, 13580, 5);
ok(plan.values.length === 6 && plan.values[0] === 2855 && plan.values.at(-1) === 13580, 'перенос: остановки');
ok(plan.values.every((v, i) => i === 0 || v > plan.values[i - 1]), 'число растёт');
// независимая сверка переносов сложением столбиком
plan.values.slice(1).forEach((b, i) => {
  const a = plan.values[i], add = b - a, cols = [];
  let carry = 0;
  for (let col = 0; col < 8; col++) {
    const sum = Math.floor(a / 10 ** col) % 10 + Math.floor(add / 10 ** col) % 10 + carry;
    carry = sum >= 10 ? 1 : 0;
    if (carry) cols.push(col);
  }
  ok(JSON.stringify(cols) === JSON.stringify(plan.carries[i]), `переносы шага ${i + 1}: ${a} + ${add}`);
});
ok(JSON.stringify(carryPlan(95, 110, 1).carries) === '[[0,1]]', 'перенос в новый разряд');
ok(JSON.stringify(changedColumns(999, 1000)) === '[0,1,2,3]' && JSON.stringify(changedColumns(120, 125)) === '[0]', 'изменившиеся разряды');
ok(carryAt(0, plan).value === 2855 && carryAt(0, plan).discs.length === 0, 'до старта число стоит');
ok(carryAt(carryLength(plan), plan).value === 13580 && carryAt(99, plan).value === 13580, 'число доходит до итога');
prev = 0;
steps(0, 5, 0.02, (u) => {
  const s = carryAt(u, plan);
  ok(s.value >= prev && plan.values.includes(s.value), 'на экране только остановки, без отката');
  ok(s.discs.every((d) => d.k >= 0 && d.k <= 1) && (s.discs.length === 0 || s.squash === 0), 'кружок летит до смены цифр');
  prev = s.value;
});
checked.add('carry');

for (const rings of [3, 6, 7]) {
  const cells = hexCells(rings);
  ok(cells.length === 1 + 3 * rings * (rings + 1), `соты: ${rings} колец`);
  ok(cells.every((c, i) => i === 0 || c.angle >= cells[i - 1].angle), 'порядок по кругу');
  ok(new Set(cells.map((c) => `${c.q},${c.r}`)).size === cells.length, 'ячейки не повторяются');
}
const cells = hexCells(6);
ok(cells[0].ring === 0 && near(cells[1].x, 0) && cells[1].y < 0, 'заливка начинается от центра вверх');
ok(hexAt(0, 127, 86).filled === 0 && near(hexAt(9, 127, 86).filled, 127 * 0.86) && hexAt(9, 127, 86).reading === 86, 'соты: доля ячеек равна проценту');
prev = -1;
steps(0, 4, 0.02, (u) => { const s = hexAt(u, 127, 86); ok(s.filled >= prev - 1e-9 && s.reading <= 86 && near(s.reading, Math.min(86, Math.round(86 * s.k))), 'число идёт вместе с заливкой'); prev = s.filled; });
checked.add('hex');

ok(timesAt(0.5).rot === 0 && timesAt(0.5).unit === 1, 'крат: сначала плюс и единица');
ok(timesAt(3).rot === 135 && timesAt(3).unit === 0 && timesAt(3).fig === 1 && timesAt(3).sign === 1, 'крат: крест, единица ушла, число выросло');
prev = 0;
steps(0, 3, 0.02, (u) => { const s = timesAt(u); ok(s.fig >= prev - 1e-9 && s.fig <= 1 && (s.fig < 0.99 || s.unit === 0), 'единица уходит раньше, чем число выросло'); prev = s.fig; });
checked.add('times');

const segs = splitSegments([120, 31, 90, 60], 0.02);
ok(near(segs[0].x0, 0) && near(segs.at(-1).x1, 1) && segs.every((s, i) => i === 0 || near(s.x0, segs[i - 1].x1 + 0.02)), 'разбор: части встык с зазором');
ok(near((segs[0].x1 - segs[0].x0) / (segs[2].x1 - segs[2].x0), 120 / 90), 'ширина части по её числу');
ok(splitSegments([1, 1], 0).every((s) => near(s.x1 - s.x0, 0.5)), 'без зазора — сплошная полоса');
ok(breakdownAt(1, 4).lift === 0 && breakdownAt(1, 4).bar === 1 && breakdownAt(1, 4).parts.every((k) => k === 0), 'разбор: пауза на итоге');
ok(breakdownAt(9, 4).parts.every((k) => k === 1) && breakdownAt(9, 4).open === 1, 'все части досчитаны');
ok(near(moveLength('breakdown', {parts: [1, 2, 3, 4]}), 0.5 + 1 + 0.8 + 0.36 + 0.9), 'длина разбора');
checked.add('breakdown');

// ── заставки знака ──
ok(spotlightAt(0).lit < 0.2 && spotlightAt(0).beam === 0, 'прожектор: знак в темноте');
ok(near(spotlightAt(6).x, 0.5, 0.003) && spotlightAt(6).lit === 1 && spotlightAt(6).house === 1, 'луч встал на знак, зал светлый');
let maxX = 0, minAfter = 1;
steps(0, 3, 0.01, (u) => { const s = spotlightAt(u); maxX = Math.max(maxX, s.x); if (u > 0.9) minAfter = Math.min(minAfter, s.x); ok(s.lit >= 0.16 - 1e-9 && s.lit <= 1 + 1e-9, 'яркость в пределах'); });
ok(maxX > 0.7 && minAfter < 0.5 && minAfter > 0.44, 'луч проскакивает знак и возвращается');
checked.add('spotlight');

const fold = pleatsAt(0, 6);
ok(fold.angle === 82 && fold.o === 0, 'гармошка: сложена и не видна');
steps(0, 2, 0.02, (u) => {
  const s = pleatsAt(u, 6);
  ok(near(s.panels[1].x - s.panels[0].x, s.width / 6) && near(s.panels.reduce((sum, p) => sum + p.x, 0), 0), 'панели встык и по центру');
  ok(s.angle >= -1e-9 && s.angle <= 82, 'раскрытие без перелёта');
});
ok(pleatsAt(2, 6).angle < 0.2 && near(pleatsAt(2, 6).width, 1, 1e-4) && Math.abs(pleatsAt(2, 6).panels[1].shade) < 0.01, 'карточка плоская, тени нет');
ok(pleatsAt(0.3, 6).panels[0].rot === -pleatsAt(0.3, 6).panels[1].rot, 'соседние складки зеркальны');
checked.add('accordion');

// ── интерфейс ──
ok(JSON.stringify(parseKeys('shift+mod+p').map((c) => c.map((k) => k.legend))) === '[["Shift","Cmd","P"]]', 'модификаторы в порядке клавиатуры');
ok(parseKeys('mod+k', {platform: 'win'})[0][0].legend === 'Ctrl' && parseKeys('cmd+enter', {glyphs: true})[0].map((k) => k.legend).join('') === '⌘↩', 'платформа и значки');
ok(parseKeys('g i').length === 2 && parseKeys('g i')[1][0].legend === 'I', 'последовательность');
const kp = keysPlan([{at: 1, keys: 'mod+k'}, {at: 3, keys: 'g i'}]);
const [modKey, letter] = kp[0].caps;
ok(modKey.mod && modKey.down < letter.down && modKey.up > letter.up, 'модификатор вниз первым, вверх последним');
ok(keysAt(1, kp)[0].caps[1].depth === 1 && keysAt(1, kp)[0].caps[0].depth === 1, 'сочетание срабатывает ровно в at');
ok(keysAt(kp[0].rise - 0.01, kp)[0].enter === 0 && keysAt(2.6, kp)[0].caps.every((k) => k.depth === 0), 'до входа пусто, после — клавиши отпущены');
ok(kp[0].leave <= kp[1].rise && keysAt(kp[1].rise + 0.3, kp)[0].out === 1, 'прежнее сочетание уходит, когда входит следующее');
ok(near(keysAt(3, kp)[1].caps[1].depth, 1) && keysAt(3 - 0.67, kp)[1].caps[0].depth === 1, '«g i»: сначала первая клавиша, вторая — в at');
steps(0, 5, 0.01, (u) => { for (const g of keysAt(u, kp)) ok(g.caps.every((k) => k.depth >= 0 && k.depth <= 1), 'ход клавиши без перелёта'); });
ok(near(keysLength(kp), kp[1].end), 'длина — до отпускания последней клавиши');
checked.add('keys');

const pp = promptPlan(60, {steps: 3});
ok(promptAt(0, pp).typed === 0 && promptAt(pp.send, pp).typed === 60 && promptAt(pp.send, pp).ready, 'запрос напечатан до отправки');
ok(promptAt(pp.swell, pp).swell === 0 && promptAt(pp.win, pp).swell === 1, 'поле разрастается после отправки');
ok(promptAt(pp.win, pp).checks.every((k) => k === 0) && promptAt(pp.length, pp).checks.every((k) => k === 1) && promptAt(pp.length, pp).toast === 1, 'галочки и плашка — после окна');
steps(0, pp.length, 0.05, (u) => { const s = promptAt(u, pp); ok(s.blocks.every((k, i) => i === 0 || k <= s.blocks[i - 1] + 1e-9) && s.checks.every((k, i) => i === 0 || k <= s.checks[i - 1] + 1e-9), 'блоки и шаги по порядку'); });
ok(promptPlan(120).length > promptPlan(60).length && near(moveLength('prompt', {prompt: 'x'.repeat(60)}), pp.length), 'длинный запрос — длиннее сцена');
checked.add('prompt');

// У каждого слова словаря есть проверка выше.
ok([...Object.keys(MOVES), ...Object.keys(VIAS)].every((k) => checked.has(k)), `без проверки: ${[...Object.keys(MOVES), ...Object.keys(VIAS)].filter((k) => !checked.has(k)).join(', ')}`);

// ── проверка сценария ──
ok(validateMoves({}).length === 1, 'пустой сценарий');
ok(validateMoves({moves: [{move: 'кот'}]}).some((e) => /Нет приёма/.test(e)), 'неизвестный приём');
ok(validateMoves({moves: [{move: 'титр', via: 'шторка'}]}).some((e) => /Нет перехода/.test(e)), 'неизвестный переход');
ok(validateMoves({moves: [{move: 'титр', dur: 0.5}]}).some((e) => /0,8/.test(e)), 'слишком короткая сцена');
ok(validateMoves({moves: [{move: 'титр'}, {move: 'титр', via: 'колонки', dur: 1.5}]}).some((e) => /переход/.test(e)), 'сцена короче перехода');
ok(validateMoves({moves: [{move: 'эмбарго', lines: ['без скобок']}]}).some((e) => /скобках/.test(e)), 'эмбарго без плашек');
ok(validateMoves({moves: [{move: 'эмбарго', lines: ['[а] [б] [в] [г] [д] [е]'], dur: 3}]}).some((e) => /не меньше/.test(e)), 'сцена короче механики');
ok(validateMoves({moves: [{move: 'перенос', from: 9, value: 3}]}).some((e) => /растёт/.test(e)), 'перенос вниз');
ok(validateMoves({moves: [{move: 'соты', value: 140}]}).some((e) => /процент/.test(e)), 'соты больше 100');
ok(validateMoves({moves: [{move: 'разбор', parts: [{value: 1}]}]}).some((e) => /частей/.test(e)), 'разбор из одной части');
ok(validateMoves({moves: [{move: 'клавиши', steps: [{at: 0.1, keys: 'mod+k'}]}]}).some((e) => /слишком рано/.test(e)), 'клавиши не успевают встать');
ok(validateMoves({moves: [{move: 'прожектор'}]}).some((e) => /знак/.test(e)) && validateMoves({moves: [{move: 'гармошка', src: 'logo.png'}]}).length === 0, 'знак — слово или своя картинка');
ok(validateMoves({moves: [{move: 'титр', tone: 'neon'}]}).some((e) => /tone/.test(e)), 'неизвестный тон');
ok(validateMoves({moves: [{move: 'титр'}], end: 'ленты'}).some((e) => /выключение/.test(e)), 'ролик заканчивает только выключение');
ok(naturalDur('embargo', {lines: ['[а] [б] [в] [г] [д] [е]']}) > NATURAL.embargo && naturalDur('title', {}) === NATURAL.title, 'длина сцены растёт с содержимым');

// ── пример ──
const example = JSON.parse(readFileSync(new URL('../../examples/moves/film.json', import.meta.url), 'utf8'));
ok(validateMoves(example).length === 0, `пример проходит проверку: ${validateMoves(example).join('; ')}`);
const usedMoves = new Set(example.moves.map((m) => resolveMove(m.move)));
const usedVias = new Set([...example.moves.map((m) => resolveVia(m.via ?? 'cut')), resolveVia(example.end ?? 'cut')]);
ok(Object.keys(MOVES).every((k) => usedMoves.has(k)), `пример показывает все приёмы (нет: ${Object.keys(MOVES).filter((k) => !usedMoves.has(k)).join(', ')})`);
ok(Object.keys(VIAS).every((k) => usedVias.has(k)), `пример показывает все переходы (нет: ${Object.keys(VIAS).filter((k) => !usedVias.has(k)).join(', ')})`);

// ── тексты поставки: только свои слова, без имён чужих наборов и движков ──
const shipped = ['moves.js', '../templates/moves/index.html', '../../examples/moves/film.json', '../../knowledge/effects-bank/code-moves.md'];
for (const rel of shipped) {
  const url = new URL(rel, import.meta.url);
  ok(existsSync(url), `есть ${rel}`);
  ok(!/remo(cn|tion)|shadcn|react/i.test(readFileSync(url, 'utf8')), `${rel}: без чужих имён`);
}
const template = readFileSync(new URL('../templates/moves/index.html', import.meta.url), 'utf8');
ok(!/https?:\/\//.test(template.replace(/http:\/\/www\.w3\.org\/\S+/g, '')), 'шаблон ничего не грузит из сети');
const inline = JSON.parse(/<script type="application\/json" id="film">\s*([\s\S]*?)\s*<\/script>/.exec(template)[1]);
ok(validateMoves(inline).length === 0 && new RegExp(`data-duration="${totalDuration(inline.moves)}"`).test(template), 'вшитый сценарий проходит проверку, длина шаблона равна его длине');

console.log(`ok ${n}`);
