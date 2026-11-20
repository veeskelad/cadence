// Проверка словаря инфографики без браузера: node engine/lib/board.test.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {findJumps} from '../video-check.mjs';
import {TEAR_W, HOOK_LEAD, PREROLL, sceneLead, centerShift, LEAVE, leave, leaveStarts, LABELS, filmLang, COLUMN, columnAxis, PRESETS, withPreset, splitZone, WORDS, resolveWord, timeline, totalDuration, cameraAt, tearAt, appear, MOTION, countAt, formatNumber, typeAt,
  tornPolygon, onColor, safeRect, validateFilm} from './board.js';

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

// Слова: каждое имя находится по-русски и по ключу, ё = е, регистр не важен.
for (const [key, names] of Object.entries(WORDS)) {
  ok(resolveWord(key) === key, key);
  for (const name of names) ok(resolveWord(name) === key, name);
}
ok(resolveWord('СЧЕТЧИК') === 'counter', 'ё и регистр');
assert.throws(() => resolveWord('единорог'), /Нет слова/); n++;
// Русские имена не повторяются между словами.
const all = Object.values(WORDS).flat();
ok(new Set(all).size === all.length, 'русские имена уникальны');

// Слова-варианты: «нет» перечёркивает, «телевизор» — телевизор; поле сцены сильнее варианта.
ok(withPreset({word: 'нет', icon: 'camera'}).cross === true, 'нет → крест');
ok(withPreset({word: 'Телевизор'}).device === 'tv' && withPreset({word: 'телевизор', device: 'phone'}).device === 'phone', 'телевизор');
ok(Object.keys(PRESETS).every((n) => resolveWord(n)), 'варианты — существующие слова');

// Время: сцены подряд, at — явное начало.
const words = [{word: 'заголовок', dur: 2}, {word: 'счётчик', dur: 3}, {word: 'весы', at: 6, dur: 2}];
const tl = timeline(words);
ok(tl[1].start === 2 && tl[1].end === 5, 'подряд');
ok(tl[2].start === 6, 'at');
ok(totalDuration(words) === 8, 'длина');
const anchored = timeline([{word: 'шаг', at: 1}, {word: 'шаг', at: 4.5}, {word: 'шаг', at: 6, dur: 2}]);
ok(anchored[0].dur === 3.5 && anchored[1].end === 6, 'без dur — до следующей сцены');

// Камера: в середине сцены видна только она; на стыке видны обе, без пустого кадра.
const kinds = ['cut', 'pan-up', 'push'];
for (let t = 0; t < 8; t += 0.05) {
  const cams = cameraAt(t, tl, {transition: 0.6, kinds});
  ok(cams.some((c) => c.visible && c.o > 0.45) || (t >= 4.85 && t < 6.05), `кадр не пустой в ${t.toFixed(2)}`);   // 5–6 с: дыра в сценарии (at: 6)
}
const mid = cameraAt(3.5, tl, {kinds});
ok(mid[1].visible && !mid[0].visible && mid[1].y === 0, 'середина сцены');
const seam = cameraAt(2, tl, {transition: 0.6, kinds});
ok(seam[0].visible && seam[1].visible && seam[0].y < 0 && seam[1].y > 0, 'pan-up: старая уходит вверх, новая снизу');
// Детерминизм: тот же t — те же числа.
ok(JSON.stringify(cameraAt(2.13, tl, {kinds})) === JSON.stringify(cameraAt(2.13, tl, {kinds})), 'перемотка');
ok(cameraAt(0, timeline([{word: 'шаг', at: 0.2, dur: 2}]))[0].visible, 'первая сцена на якоре 0,2 с видна с кадра 0');
{ const one = timeline([{word: 'шаг', at: 0, dur: 3}]);
  ok(cameraAt(2.0, one, {exit: 'push'})[0].o === 1, 'exit: до ухода сцена стоит');
  const late = cameraAt(2.97, one, {exit: 'push'})[0];
  ok(late.visible && late.o < 0.2 && late.scale > 1.2, 'exit push: к концу сцена улетает в камеру');
  ok(cameraAt(2.97, one)[0].o === 1, 'без exit последняя сцена стоит до конца');
  ok(validateFilm({exit: 'wobble', words: [{word: 'шаг'}]}).some((e) => /exit/.test(e)), 'exit проверяется'); }
ok(tearAt(1, tl, {kinds: ['cut', 'tear']}) === null && tearAt(2, tl, {kinds: ['cut', 'tear']}).i === 1, 'tear на стыке');
// tear — узкая полоса-шторка: кадр целиком цветом не заливается, обе сцены видны по разные стороны шва под полосой
ok(TEAR_W <= 0.4, 'tear: полоса уже половины кадра');
for (let t = 1.71; t < 2.3; t += 1 / 60) {
  const tr = tearAt(t, tl, {transition: 0.6, kinds: ['cut', 'tear']});
  if (!tr) continue;
  ok(tr.seam > tr.x && tr.seam < tr.x + TEAR_W, 'tear: шов под полосой');
  const c = cameraAt(t, tl, {transition: 0.6, kinds: ['cut', 'tear']});
  ok(c[0].visible && c[1].visible && c[0].tear === 'out' && c[1].tear === 'in', 'tear: обе сцены видны у шва');
}

// Вход: до начала невидим, после входа — на месте без сдвига; smooth без перелёта.
for (const kind of ['pop', 'drop', 'slide', 'slide-r', 'rise', 'stamp', 'fade']) {
  const before = appear(-0.1, kind), after = appear(2, kind);
  ok(before.o === 0, `${kind}: до начала невидим`);
  ok(after.o === 1 && Math.abs(after.s - 1) < 1e-9 && after.x === 0 && Math.abs(after.y) < 1e-9 && Math.abs(after.r) < 1e-9, `${kind}: сел на место`);
  let max = 0;
  for (let u = 0; u < 1; u += 0.01) max = Math.max(max, appear(u, kind, MOTION.smooth).s);
  ok(kind === 'drop' || kind === 'stamp' ? true : max <= 1 + 1e-9, `${kind}: smooth без перелёта`);
}
let over = 0;
for (let u = 0; u < 1; u += 0.01) over = Math.max(over, appear(u, 'pop', MOTION.snappy).s);
ok(over > 1.01, 'snappy с перелётом');
ok(MOTION.smooth.enter === 0.45, 'вход 0,45 с по умолчанию');
// Хук с кадра 0 входит движением: первый элемент (t0 0,1–0,15 с) уже виден и ещё движется, а не стоит готовым.
for (const t0 of [0.1, 0.15]) { const a = appear(HOOK_LEAD - t0, 'pop'); ok(a.o > 0.3 && a.o < 1 && a.s < 0.99, `кадр 0: первый элемент входит (t0 ${t0})`); }
ok(appear(HOOK_LEAD - 0.15 - 2 * MOTION.smooth.stagger, 'pop').o === 0, 'кадр 0: третий элемент ещё не вошёл');
// Уход: 0,4 с, до начала стоит, к концу невидим, без скачка прозрачности за кадр 60 fps.
ok(LEAVE === 0.4 && leave(-0.1).o === 1 && leave(0).o === 1 && leave(LEAVE).o === 0 && leave(LEAVE + 1).o === 0, 'уход: края');
{ let worst = 0; for (let v = 0; v < LEAVE; v += 1 / 60) worst = Math.max(worst, leave(v).o - leave(v + 1 / 60).o); ok(worst < 0.12, `уход плавный (${worst.toFixed(3)} за кадр)`); }
{ let worst = 0; for (let u = 0; u < 1; u += 1 / 60) worst = Math.max(worst, appear(u + 1 / 60, 'pop').o - appear(u, 'pop').o); ok(worst < 0.12, `вход плавный (${worst.toFixed(3)} за кадр)`); }
{ const st = leaveStarts([0.1, 0.18, 0.26, 1.6], 3);
  ok(Math.abs(st[0] + LEAVE - 3) < 1e-9, 'заголовок уходит последним, ровно к концу');
  ok(st[3] < st[2] && st[2] < st[1] && st[1] < st[0], 'последний вошедший уходит первым');
  ok(3 - st[3] <= LEAVE + 0.3 + 1e-9, 'уход всей сцены не дольше 0,7 с');
  const many = leaveStarts(Array.from({length: 24}, (_, i) => i * 0.05), 4);
  ok(Math.min(...many) >= 4 - LEAVE - 0.3 - 1e-9, 'много элементов — тот же предел'); }
// Смена сцены короткая (Дима 20.11: «экран пустой остаётся»), а новая сцена приезжает уже с текстом.
ok(MOTION.smooth.transition >= 0.6 && MOTION.smooth.transition <= 0.75 && MOTION.snappy.transition <= MOTION.smooth.transition, 'смена сцены быстрая');
{ const k3 = ['cut', 'pan-up', 'cut'];
  ok(sceneLead(0, k3) === HOOK_LEAD && sceneLead(2, k3) === 0, 'промотка: хук и склейка');
  const lead = sceneLead(1, k3), half = MOTION.smooth.transition / 2;
  ok(PREROLL > 0 && Math.abs(lead - PREROLL * half) < 1e-9, 'промотка сцены, которую приносит камера');
  // к середине перехода первый элемент новой сцены (t0 0,15) уже виден
  ok(appear(lead - 0.15, 'pop').o > 0.5, 'на середине перехода новая сцена уже не пустая'); }
// push — одно движение по очереди: старая только растёт и тает, потом новая подрастает и проявляется; две сцены не видны
// разом (текст на тексте), тёмная пауза между ними короткая, без затемнения во весь кадр и без скачков между кадрами 60 fps
// (Дима 20.11: «моргает, потом блюр, потом снова увеличиваясь исчезает»; «сначала одно исчезает, потом другое появляется»).
for (const motion of Object.values(MOTION)) {
  const tr = motion.transition, pk = ['cut', 'push'], two = timeline([{word: 'шаг', dur: 3}, {word: 'шаг', dur: 3}]);
  let prev = null, worst = 0, dark = 0;
  for (let t = 3 - tr / 2 - 0.05; t <= 3 + tr / 2 + 0.05; t += 1 / 60) {
    const [a, b] = cameraAt(t, two, {transition: tr, kinds: pk});
    ok(a.dim === 0 && b.dim === 0, 'push без затемнения');
    const oa = a.visible ? a.o : 0, ob = b.visible ? b.o : 0, sa = a.scale, sb = b.scale;
    ok(Math.min(oa, ob) < 0.2, `push: две сцены не стоят друг на друге (${t.toFixed(3)})`);
    if (Math.max(oa, ob) < 0.15) dark += 1 / 60;
    if (prev) {
      ok(oa <= prev.oa + 1e-9 && ob >= prev.ob - 1e-9, 'push: прозрачность меняется в одну сторону');
      if (a.visible && prev.av) ok(sa >= prev.sa - 1e-9, 'push: старая сцена только растёт');
      if (b.visible && prev.bv) ok(sb >= prev.sb - 1e-9, 'push: новая сцена только подрастает');
      worst = Math.max(worst, Math.abs(oa - prev.oa), Math.abs(ob - prev.ob));
    }
    prev = {oa, ob, sa, sb, av: a.visible, bv: b.visible};
  }
  ok(worst < 0.15, `push плавный (${worst.toFixed(3)} за кадр)`);
  ok(dark <= 0.15, `push: пустая пауза между сценами ${dark.toFixed(2)} с`);
}
// Сцена по центру кадра по ширине, не выходя из рабочей зоны (9:16: зона x 65–886, центр кадра 540).
{ const z = safeRect(1080, 1920), mid = (b, d) => (b.x0 + b.x1) / 2 + d;
  const small = {x0: 100, x1: 500}; ok(Math.abs(mid(small, centerShift([small], z, 1080)) - 540) < 1e-9, 'узкая сцена — по центру кадра');
  const wide = {x0: 0, x1: 800}, dw = centerShift([wide], z, 1080);
  ok(Math.abs(wide.x1 + dw - (z.x + z.w)) < 1e-9 && wide.x0 + dw >= z.x, 'широкая — у правого края зоны, не за ним');
  const huge = {x0: 0, x1: 900}; ok(Math.abs(mid(huge, centerShift([huge], z, 1080)) - (z.x + z.w / 2)) < 1e-9, 'шире зоны — по центру зоны');
  const z16 = safeRect(1920, 1080), b16 = [{x0: 200, x1: 900}, {x0: 950, x1: 1100}];
  ok(Math.abs((200 + 1100) / 2 + centerShift(b16, z16, 1920) - 960) < 1e-9, '16:9 — блок из нескольких элементов по центру');
  ok(centerShift([], z, 1080) === 0, 'без размеров — без сдвига'); }
// Подписи по языку: у каждого языка все ключи; русский ролик — «ИТОГО», не TOTAL.
const keys = Object.keys(LABELS.en).sort().join();
for (const [lang, l] of Object.entries(LABELS)) ok(Object.keys(l).sort().join() === keys && l.days.length === 7, `подписи ${lang}: все ключи`);
ok(LABELS[filmLang({words: [{word: 'квитанция', title: 'Одна чашка'}]})].total === 'ИТОГО', 'кириллица → русские подписи');
ok(filmLang({words: [{word: 'receipt', title: 'One cup'}]}) === 'en' && filmLang({lang: 'en', words: [{word: 'чек'}]}) === 'en', 'английский и явный lang');
ok(validateFilm({lang: 'fr', words: [{word: 'шаг'}]}).some((e) => /lang/.test(e)), 'lang проверяется');
ok(validateFilm({fps: 60, exit: 'leave', words: [{word: 'шаг'}]}).length === 0 && validateFilm({fps: 45, words: [{word: 'шаг'}]}).some((e) => /fps/.test(e)), 'fps и exit leave');
// Столбик по оси: по центру кадра, если блок помещается в рабочую зону; иначе по центру зоны.
ok(COLUMN.has('receipt') && COLUMN.has('cheque'), 'квитанция и чек — столбиком');
ok(columnAxis(575, safeRect(1080, 1920), 1080) === 540 && Math.round(columnAxis(755, safeRect(1080, 1920), 1080)) === 475, 'ось 9:16');
ok(columnAxis(1200, safeRect(1920, 1080), 1920) === 960, 'ось 16:9');

// Счётчик: начало, конец, монотонно по остановкам, без отката.
ok(countAt(-1, 2, [0, 100]) === 0 && countAt(5, 2, [0, 100]) === 100, 'края');
let prev = -1;
for (let u = 0; u <= 2; u += 0.02) { const v = countAt(u, 2, [0, 50, 100]); ok(v >= prev - 1e-9, `монотонно ${u.toFixed(2)}`); prev = v; }
ok(Math.abs(countAt(1, 2, [0, 50, 100]) - 50) < 1e-6, 'остановка в середине');
ok(formatNumber(1234567) === '1,234,567' && formatNumber(-1500, {sep: ' '}) === '−1 500' && formatNumber(2.45, {decimals: 1}) === '2.5', 'формат');
ok(typeAt('привет', 0.1, 30) === 'при' && typeAt('привет', -1) === '', 'печать');

// Рваный край — один и тот же при одном seed.
ok(tornPolygon(5) === tornPolygon(5) && tornPolygon(5) !== tornPolygon(6), 'seed');
ok(onColor('#F5ECC2') === '#151413' && onColor('#151413') === '#F4F1EA' && onColor('#D97757') === '#151413', 'контраст: тёмный текст на коралловом');
const s = safeRect(1080, 1920);
ok(s.y === 288 && Math.round(s.x + s.w) === 886 && s.y + s.h === 1440, 'рабочая зона 9:16');

// Составная сцена: колонки внутри рабочей зоны, без наложения.
const zs = splitZone({x: 100, y: 100, w: 1000, h: 800}, 3, false);
ok(zs.length === 3 && zs[0].w > zs[1].w && zs.every((z, i) => i === 0 || z.x >= zs[i - 1].x + zs[i - 1].w) && zs[2].x + zs[2].w <= 1100, 'колонки');
ok(splitZone({x: 0, y: 0, w: 10, h: 10}, 1, false)[0].w === 10, 'одно слово — вся зона');
ok(validateFilm({words: [{word: 'весы', with: [{word: 'кот'}]}]}).some((e) => /with/.test(e)), 'with проверяется');
ok(validateFilm({words: [{word: 'весы', with: [{word: 'шаг'}, {word: 'шаг'}, {word: 'шаг'}]}]}).some((e) => /не больше двух/.test(e)), 'with до двух');
ok(validateFilm({words: [{word: 'весы', safe: [0.06, 0.5, 0.76, 0.25]}]}).length === 0, 'safe сцены принимается');
ok(validateFilm({words: [{word: 'весы', safe: [0.5, 0.5, 0.76, 0.25]}]}).some((e) => /safe/.test(e)), 'safe за краем кадра — ошибка');

// Проверка сценария.
ok(validateFilm({}).length === 1, 'пустой сценарий');
ok(validateFilm({words: [{word: 'кот'}]}).some((e) => /Нет слова/.test(e)), 'неизвестное слово');
ok(validateFilm({words: [{word: 'весы', dur: 0.3}]}).some((e) => /0,8/.test(e)), 'слишком короткая сцена');
ok(validateFilm({words: [{word: 'весы', transition: 'spin'}]}).length === 1, 'неизвестный переход');
const example = JSON.parse(readFileSync(new URL('../../examples/board-explainer/film.json', import.meta.url), 'utf8'));
ok(validateFilm(example).length === 0, 'пример проходит проверку');
const used = new Set(example.words.map((w) => resolveWord(w.word)));
ok(Object.keys(WORDS).every((k) => used.has(k)), `пример показывает все слова (нет: ${Object.keys(WORDS).filter((k) => !used.has(k)).join(', ')})`);

// video-check: затемнение во весь кадр за кадр и моргание находятся, плавный переход и задуманная склейка — нет.
{ const fps = 60, frames = (fn) => Array.from({length: 240}, (_, k) => ({t: k / fps, ...fn(k)}));
  const smooth = frames((k) => ({YAVG: 40 + 10 * Math.sin(k / 40), YDIF: 0.6}));
  ok(findJumps(smooth).length === 0, 'video-check: плавное видео чисто');
  const blink = frames((k) => ({YAVG: k >= 100 && k < 110 ? 26 : 38, YDIF: k === 100 || k === 110 ? 12 : 0.3}));
  const found = findJumps(blink).map((x) => x.kind);
  ok(found.includes('моргание') && found.includes('скачок'), 'video-check: затемнение кадра и возврат найдены');
  const cut = frames((k) => ({YAVG: k < 120 ? 38 : 50, YDIF: k === 120 ? 20 : 0.3}));
  ok(findJumps(cut).length === 1 && findJumps(cut, {cuts: [2]}).length === 0, 'video-check: склейка встык из --cuts не ошибка'); }
console.log(`ok ${n}`);
