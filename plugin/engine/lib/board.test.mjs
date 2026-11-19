// Проверка словаря инфографики без браузера: node engine/lib/board.test.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HOOK_LEAD, PRESETS, withPreset, splitZone, WORDS, resolveWord, timeline, totalDuration, cameraAt, tearAt, appear, MOTION, countAt, formatNumber, typeAt,
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
  ok(cams.some((c) => c.visible) || (t >= 5 && t < 5.7), `кадр не пустой в ${t.toFixed(2)}`);
}
const mid = cameraAt(3.5, tl, {kinds});
ok(mid[1].visible && !mid[0].visible && mid[1].y === 0, 'середина сцены');
const seam = cameraAt(2, tl, {transition: 0.6, kinds});
ok(seam[0].visible && seam[1].visible && seam[0].y < 0 && seam[1].y > 0, 'pan-up: старая уходит вверх, новая снизу');
// Детерминизм: тот же t — те же числа.
ok(JSON.stringify(cameraAt(2.13, tl, {kinds})) === JSON.stringify(cameraAt(2.13, tl, {kinds})), 'перемотка');
ok(cameraAt(0, timeline([{word: 'шаг', at: 0.2, dur: 2}]))[0].visible, 'первая сцена на якоре 0,2 с видна с кадра 0');
ok(tearAt(1, tl, {kinds: ['cut', 'tear']}) === null && tearAt(2, tl, {kinds: ['cut', 'tear']}).i === 1, 'tear на стыке');

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
ok(appear(HOOK_LEAD - 0.15, 'pop').o === 1, 'первая сцена собрана на кадре 0');

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

// Проверка сценария.
ok(validateFilm({}).length === 1, 'пустой сценарий');
ok(validateFilm({words: [{word: 'кот'}]}).some((e) => /Нет слова/.test(e)), 'неизвестное слово');
ok(validateFilm({words: [{word: 'весы', dur: 0.3}]}).some((e) => /0,8/.test(e)), 'слишком короткая сцена');
ok(validateFilm({words: [{word: 'весы', transition: 'spin'}]}).length === 1, 'неизвестный переход');
const example = JSON.parse(readFileSync(new URL('../../examples/board-explainer/film.json', import.meta.url), 'utf8'));
ok(validateFilm(example).length === 0, 'пример проходит проверку');
const used = new Set(example.words.map((w) => resolveWord(w.word)));
ok(Object.keys(WORDS).every((k) => used.has(k)), `пример показывает все слова (нет: ${Object.keys(WORDS).filter((k) => !used.has(k)).join(', ')})`);

console.log(`ok ${n}`);
