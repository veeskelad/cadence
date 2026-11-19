// node engine/lib/proofs.test.mjs — слой доказательств: кадр не зависит от порядка перемотки, вход и уход по нормам,
// вставки живут после посадки, дорожки, замер «было → стало», снимок статьи, дорога, полоса света, ошибки сценария
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ALERT, CLICK, FLASH, PRESETS, SYNONYMS, WORDS, clickDuplicates, cornerSize, flashState, resolveProof, zoomGeom} from './proofs.js';
import {proofEnd, DRIFT, ENTER, EXIT, KINDS, LIGHTBAR, MIN_ON, PUSH, envelope, lightbarState, markAt, markSpan, proofState, overlapsCaptions, raceTimes, rectAt, roadBuildings,
  shotGeom, validateProofs} from './proofs.js';

const film = JSON.parse(readFileSync(new URL('../../examples/proofs/film.json', import.meta.url), 'utf8'));
// описание снимка пишет scripts/news_shot.py; здесь — такое же по форме, чтобы тест не зависел от work/
const META = {width: 1472, height: 248, lines: [[974, 34, 330, 44], [56, 98, 858, 44]], head: {file: 'primer-head.png', width: 1472, height: 330}};
const list = film.proofs.map((p) => (p.shot ? {...p, shotMeta: META} : p));
const DUR = 28, F = {W: 1080, H: 1920};
// пример — по правилу «меньше, но целиком»: каждая вставка на своей фразе, рамки и кольца только где голос говорит, куда смотреть
assert.ok(list.every((p) => KINDS.includes(p.kind)) && list.length <= 8, 'пример без лишних вставок');
for (const [i, p] of list.entries()) if (p.kind !== 'road') {
  const cap = film.captions.find((c) => c.from >= p.at - 0.05 && c.from < proofEnd(p));
  if (p.kind !== 'race') assert.ok(cap, `вставка ${i} (${p.kind}) стоит на своей фразе`);
}
const kinds = list.map((p) => p.kind);
assert.ok(!kinds.some((k, i) => ['race', 'measure'].includes(k) && ['race', 'measure'].includes(kinds[i + 1])), 'дорожки и замер не идут подряд: одна мысль — одна вставка-сравнение');
assert.equal(validateProofs(list, {duration: DUR, videos: film.videos}), list.length, 'пример проходит проверку');

// 1. Детерминизм: один и тот же t — одно и то же состояние при любом порядке вызовов.
const ts = Array.from({length: Math.round(DUR * 30) + 1}, (_, i) => i / 30);
const forward = ts.map((t) => list.map((p) => JSON.stringify(proofState(p, t, F))));
for (const t of [...ts].reverse()) assert.deepEqual(list.map((p) => JSON.stringify(proofState(p, t, F))), forward[Math.round(t * 30)], `кадр ${t.toFixed(3)} с совпадает при обратной перемотке`);

// 2. Вход: с нуля, садится к ENTER (power3.out), уход EXIT к концу, после конца не видно.
const p = {kind: 'card', src: 'x.svg', at: 1, to: 3};
assert.equal(ENTER, 0.45);
assert.equal(EXIT, 0.4);
assert.equal(envelope(1, 1, 3).k, 0, 'вход начинается с нуля');
assert.ok(Math.abs(envelope(1 + ENTER, 1, 3).k - 1) < 1e-9, 'к 0,45 с вход завершён');
assert.ok(envelope(1 + ENTER / 2, 1, 3).k > 0.9, 'power3.out: к середине входа пройдено больше 90 %');
assert.equal(proofState(p, 2).opacity, 1, 'в середине вставка видна полностью');
assert.ok(proofState(p, 3 - 1 / 30).opacity < 0.02, 'последний кадр почти прозрачный');
assert.equal(proofState(p, 3).on, false, 'на конце вставки её нет');
const s0 = proofState({...p, enter: 'right'}, 1, F);
assert.ok(s0.x > 600 && s0.opacity === 0, 'вход справа начинается из-за кадра и прозрачным');

// 3. После посадки вставка живёт: плывёт вверх, доворачивается, внутри карточки наезд.
const a = proofState(p, 1.5, F), b = proofState(p, 2.6, F);
assert.ok(b.y < a.y - 5 && Math.abs(b.rot - a.rot) > 0.5, 'карточка плывёт и доворачивается');
assert.ok(b.y >= -DRIFT.other - 1e-9, 'дрейф не больше 18 px');
assert.ok(b.push > a.push && Math.abs(proofState(p, 3 - 1e-6, F).push - PUSH) < 1e-3, `наезд внутри до ${PUSH}`);
const ring = {kind: 'ring', c: [0.5, 0.5], at: 0, to: 4};
const bd = {kind: 'race', backdrop: true, rows: [{label: 'a', period: 1}, {label: 'b', period: 2}], at: 1, to: 4};
assert.equal(proofState(bd, 1, F).dim, 0);
assert.ok(Math.abs(proofState(bd, 2, F).dim - 1) < 1e-9 && proofState(bd, 4 - 1 / 30, F).dim < 0.02, 'backdrop: кадр притушен 0,35 с и гаснет с уходом');
assert.ok(Math.abs(proofState(ring, 0.8).scale - 1.08) < 1e-6 && Math.abs(proofState(ring, 1.3).scale - 1) < 1e-6, 'кольцо дышит раз в секунду');

// 4. Маркер по словам, рамка по ключам, «плохо», врезка.
const art = {kind: 'article', quote: 'один два три четыре пять', markWords: [1, 3], at: 0, to: 4, markFrom: 1, markTo: 2.2};
const span = markSpan(art);
assert.deepEqual(markAt(span.m0, span), [0, 0, 0]);
assert.deepEqual(markAt(span.m1 + 0.01, span), [1, 1, 1]);
const keys = [{t: 0, rect: [0, 0, 0.2, 0.2]}, {t: 2, rect: [0.4, 0.2, 0.2, 0.2]}];
assert.deepEqual(rectAt(keys, 1), [0.2, 0.1, 0.2, 0.2]);
const bad = list.find((x) => x.bad);
assert.equal(proofState(bad, bad.bad - 0.01, F).bad, 0);
assert.ok(proofState(bad, bad.bad + 0.3, F).bad > 0.99, 'карточка «плохо» сереет за 0,25 с');
const mk = list.find((x) => x.mark);
assert.equal(proofState(mk, mk.at + 0.3, F).mark, 0);
assert.ok(proofState(mk, mk.at + 0.7, F).mark > 0.99, 'врезка встаёт через 0,35 с после входа');

// 5. Дорожки одним проходом: короткий день кончается раньше, самый длинный — за 0,5 с до ухода, без повторов, иконки стоят.
const race = list.find((x) => x.kind === 'race'), times = raceTimes(race), maxP = Math.max(...race.rows.map((r) => r.period));
const longI = race.rows.findIndex((r) => r.period === maxP), shortI = race.rows.findIndex((r) => r.period < maxP);
assert.ok(Math.abs(times[longI].t0 + times[longI].dur - (proofEnd(race) - EXIT - 0.5)) < 1e-9, 'самый длинный день кончается за 0,5 с до ухода');
assert.ok(Math.abs(times[shortI].dur / times[longI].dur - race.rows[shortI].period / maxP) < 1e-9, 'время заливки — доля от самого длинного');
const rowsAt = (t) => proofState(race, t, F).rows;
let prev = rowsAt(race.at).map((r) => r.fill);
for (let t = race.at; t < proofEnd(race); t += 1 / 30) {
  const cur = rowsAt(t).map((r) => r.fill);
  assert.ok(cur.every((v, j) => v >= prev[j] - 1e-12), `заливка не начинается заново (${t.toFixed(2)} с)`);
  prev = cur;
}
const endShort = times[shortI].t0 + times[shortI].dur;
assert.equal(rowsAt(endShort - 0.01)[shortI].moon, 0.25, 'луна тусклая, пока день идёт');
assert.ok(rowsAt(endShort + 0.5)[shortI].moon > 0.99 && rowsAt(endShort + 0.5)[shortI].sun < 0.36, 'день кончился — луна горит, солнце тусклое');
assert.ok(rowsAt(endShort + 0.5)[longI].fill < 1 && rowsAt(endShort + 0.5)[longI].moon === 0.25, 'длинный день ещё идёт');
assert.ok(!('x' in rowsAt(race.at + 1)[0]) && !('rot' in rowsAt(race.at + 1)[0]), 'иконки строки не катятся и не вращаются');

// 6. Замер «было → стало»: конец уезжает к новой точке, подпись меняется.
const ms = list.find((x) => x.kind === 'measure');
const before = proofState(ms, ms.stretch.at - 0.01, F), after = proofState(ms, ms.stretch.at + 1, F);
assert.equal(before.stretch, 1);
assert.ok(Math.abs(after.stretch - (ms.stretch.b[0] - ms.a[0]) / (ms.b[0] - ms.a[0])) < 1e-9, 'линия растянулась до новой точки');
assert.ok(before.tag > 0.99 && after.tag < 0.01 && after.tag1 > 0.99, 'подпись «было» ушла, «стало» встала');

// 7. Снимок статьи: окно влетает и стоит, страница сразу на цитате, движется только маркер по строкам.
const shot = list.find((x) => x.shot), g = shotGeom(shot, F);
assert.equal(g.lines.length, 2);
assert.ok(g.lines[0][1] > g.hh - 1, 'строки цитаты ниже шапки');
assert.ok(Math.abs(g.vh - Math.min(800, g.hh + META.height * g.w / META.width)) < 1e-9, 'окно вмещает шапку и абзац, не выше 800 px');
assert.equal(g.scroll, 0, 'шапка и абзац влезают в окно — страница с самого верха, заголовок не срезан');
const tall = shotGeom({...shot, vh: 0.08}, F);
assert.ok(tall.scroll > 0 && tall.scroll <= g.hh + META.height * g.w / META.width - tall.vh, 'низкое окно — цитата посередине, без пустоты под страницей');
const sh = (t) => proofState(shot, t, F);
const landed = sh(shot.at + 0.5), late = sh(shot.to - EXIT - 0.01);
assert.equal(landed.scroll, g.scroll, 'страница сразу на цитате');
assert.equal(late.scroll, landed.scroll, 'страница не едет');
assert.ok(landed.y === late.y && landed.rot === late.rot && landed.scale === late.scale, 'окно после посадки стоит');
assert.equal(late.zoom, undefined, 'без наезда на текст');
const mid = sh((shot.markFrom + shot.markTo) / 2).lines;
assert.ok(mid[0] > 0.99 && mid[1] < 0.01, 'на середине первая строка закрашена, вторая ещё нет');
const txt = {kind: 'article', quote: 'а б в', at: 0, to: 3};
assert.equal(proofState(txt, 1, F).y, proofState(txt, 2.5, F).y, 'статья из текста тоже стоит');

// 7а. Вставки не заходят на подписи.
const R = (top, bottom) => ({left: 100, right: 900, top, bottom});
const cap = [{from: 1, to: 3, text: 'подпись', rect: R(1240, 1340)}];
assert.deepEqual(overlapsCaptions([{what: 'a', at: 0, end: 2, rect: R(300, 1200)}], cap), [], 'выше подписи — можно');
assert.equal(overlapsCaptions([{what: 'a', at: 0, end: 2, rect: R(300, 1260)}], cap).length, 1, 'заход на подпись в то же время — ошибка');
assert.deepEqual(overlapsCaptions([{what: 'a', at: 3, end: 5, rect: R(300, 1300)}], cap), [], 'подпись уже ушла — можно');
assert.match(overlapsCaptions([{what: 'a', at: 0, end: 2, rect: R(300, 1300)}], [], 1236)[0], /зона подписей с 1236/);

// 8. Дорога: сужается, дома вырастают, камера поднимается; полоса света.
const road = list.find((x) => x.kind === 'road'), rd = (t) => proofState(road, t, F);
assert.equal(rd(road.narrow).rw, 820);
assert.equal(rd(road.narrow + 1.2).rw, 330, 'дорога сузилась');
assert.ok(rd(road.fill - 0.01).grow.every((v) => v === 0) && rd(road.fill + 1.5).grow.every((v) => Math.abs(v - 1) < 1e-9), 'дома выросли');
assert.equal(rd(road.rise + 1.45).cam.rx, 18, 'камера поднялась');
assert.deepEqual(roadBuildings(7), roadBuildings(7), 'дома по сиду одинаковы');
assert.equal(lightbarState(7.8 - LIGHTBAR.pre - 0.01, 7.8).on, false);
assert.ok(Math.abs(lightbarState(7.8, 7.8).sx - 7.5) < 1e-9 && lightbarState(7.8, 7.8).opacity === 1, 'на склейке полоса шире всего и ярче всего');
assert.equal(lightbarState(7.8 + LIGHTBAR.post, 7.8).on, false);

// 9. Ошибки сценария называют вставку и поле.
const err = (l, re) => assert.throws(() => validateProofs(l, {duration: DUR, videos: film.videos}), re);
err([{kind: 'arrow', at: 1}], /неизвестный вид/);
err([{kind: 'logo', src: 'a.svg', at: 1, to: 1 + MIN_ON - 0.1}], /нужно от 0\.85/);
err([{kind: 'logo', src: 'a.svg', at: '@name', to: 3}], /word_anchors/);
err([{kind: 'logo', src: 'a.svg', at: 1, to: 3, x: 540}], /доля кадра/);
err([{kind: 'card', video: 'nope', at: 1, to: 3}], /нет видео nope/);
err([{kind: 'card', video: 'clip', at: 1, to: 3}], /должны её накрывать/);
err([{kind: 'card', src: 'a.svg', crop: [0, 0, 0.5, 0.5], at: 1, to: 3}], /crop/);
err([{kind: 'card', src: 'a.svg', push: 3, at: 1, to: 3}], /push/);
err([{kind: 'card', video: 'clip', backdrop: true, at: 7.0, to: 10.6}], /backdrop/);
err([{kind: 'article', quote: 'три слова тут', markWords: [1, 5], at: 1, to: 3}], /markWords/);
err([{kind: 'article', shot: 'a.png', at: 1, to: 3}], /news_shot/);
err([{kind: 'race', rows: [{label: 'a', period: 1}], at: 1, to: 3}], /две дорожки/);
err([{kind: 'race', rows: [{label: 'a', period: 1}, {label: 'b', period: 0}], at: 1, to: 3}], /больше нуля/);
err([{kind: 'measure', a: [0, 0], b: [0.5, 0], stretch: {at: 2.5, b: [1, 0]}, at: 1, to: 3}], /stretch\.at/);
err([{kind: 'box', at: 1, to: 3, keys: [{t: 2, rect: [0, 0, 0.1, 0.1]}, {t: 1.5, rect: [0, 0, 0.1, 0.1]}]}], /по возрастанию/);
err([{kind: 'road', at: 1, to: 3, narrow: 5}], /narrow/);
err([{kind: 'logo', src: 'a.svg', at: 27.5, to: 29}], /ролик 28/);
// Слова поверх записи (examples/hud): слово → вид, уголки, лупа, титр, тревога, клик, вспышка.
{
  const hud = JSON.parse(readFileSync(new URL('../../examples/hud/film.json', import.meta.url), 'utf8'));
  const L = hud.proofs;
  assert.equal(validateProofs(L, {duration: 16, videos: hud.videos}), L.length, 'пример hud проходит проверку');
  assert.ok(L.every((q) => q.word && !q.kind), 'пример задан словами');
  for (const [w, k] of Object.entries(WORDS)) assert.equal(resolveProof({word: w, at: 0}).kind, k, `слово ${w}`);
  assert.deepEqual(resolveProof({word: 'Лупа', at: 1, zoom: 1.5}), {kind: 'card', zoom: 1.5, word: 'Лупа', at: 1}, 'поля сценария сильнее варианта');
  assert.equal(resolveProof({word: 'уголки', at: 0}).look, 'corners');
  assert.ok(Object.keys(PRESETS).every((w) => !WORDS[w]), 'слова-варианты не совпадают со словами видов');
  assert.throws(() => resolveProof({word: 'пузырь', at: 0}), /неизвестное слово «пузырь».*рамка/);
  for (const [syn, word] of Object.entries(SYNONYMS)) assert.equal(resolveProof({word: syn, at: 0}).kind, resolveProof({word, at: 0}).kind, `синоним ${syn} → ${word}`);
  assert.equal(resolveProof({word: 'Зум', at: 0}).zoom, 1.3, 'зум = лупа');
  // детерминизм
  const tt = Array.from({length: 16 * 30}, (_, i) => i / 30);
  const fw = tt.map((t) => JSON.stringify(L.map((q) => proofState(q, t, F))));
  for (const t of [...tt].reverse()) assert.equal(JSON.stringify(L.map((q) => proofState(q, t, F))), fw[Math.round(t * 30)], `hud ${t.toFixed(2)} с`);

  // лупа: растёт из своего прямоугольника — в первый кадр масштаб 1/zoom, без сдвига и поворота; держится на месте
  const lupa = resolveProof(L.find((q) => q.word === 'лупа'));
  const g = zoomGeom(lupa);
  assert.ok(Math.abs(g.x - (lupa.crop[0] + lupa.crop[2] / 2)) < 1e-9 && Math.abs(g.w - lupa.crop[2] * 1.3) < 1e-9, 'центр лупы — центр куска кадра');
  const z0 = proofState(lupa, lupa.at, F);
  assert.ok(Math.abs(z0.scale - 1 / 1.3) < 1e-9 && z0.x === 0 && z0.rot === 0, 'лупа стартует размером своего куска');
  for (const t of [8, 8.5, 9]) { const z = proofState(lupa, t, F); assert.ok(z.y === 0 && z.rot === 0 && Math.abs(z.scale - 1) < 0.02, `лупа стоит на месте в ${t} с`); }
  assert.ok(proofState(lupa, 9.2, F).push > proofState(lupa, 7.9, F).push, 'внутри лупы медленный наезд');

  // уголки дышат не больше 2,5 %, длина уголка — от 26 до 64 px
  const box = resolveProof(L.find((q) => q.word === 'уголки'));
  const sc = tt.filter((t) => t > box.at + 0.5 && t < 7.3).map((t) => proofState(box, t, F).scale);
  assert.ok(Math.max(...sc) <= 1.0251 && Math.min(...sc) >= 0.9749 && Math.max(...sc) - Math.min(...sc) > 0.01, 'уголки живут после посадки');
  assert.equal(cornerSize(1000, 20), 26); assert.equal(cornerSize(1000, 1000), 64);

  // титр: проявляется из размытия, к концу входа резкий
  const ti = resolveProof(L[0]);
  assert.ok(proofState(ti, ti.at, F).blur > 15 && proofState(ti, ti.at + 0.6, F).blur < 0.5, 'титр из размытия');

  // тревога: край сразу, значок через ALERT.icon с, потом пульс
  const al = resolveProof(L.find((q) => q.word === 'тревога'));
  assert.equal(proofState(al, al.at + ALERT.icon - 0.05, F).icon, 0, 'значок ещё не встал');
  assert.ok(proofState(al, al.at + ALERT.icon + 0.4, F).icon > 0.99, 'значок встал');
  const ed = tt.filter((t) => t > al.at + 0.5 && t < al.to - 0.5).map((t) => proofState(al, t, F).edge);
  assert.ok(Math.min(...ed) >= 0.69 && Math.max(...ed) <= 1.0001 && Math.max(...ed) - Math.min(...ed) > 0.2, 'край дышит');

  // клик: до нажатия первое состояние, после — второе; кольцо только после клика; курсор в момент клика у кнопки
  const ck = resolveProof(L.find((q) => q.word === 'клик'));
  assert.equal(proofState(ck, ck.clickAt - 0.01, F).swap, 0);
  assert.ok(proofState(ck, ck.clickAt + 0.2, F).swap > 0.99, 'кнопка сменила состояние');
  assert.ok(!proofState(ck, ck.clickAt - 0.01, F).ring.on && proofState(ck, ck.clickAt + 0.2, F).ring.on, 'кольцо после клика');
  const cur = proofState(ck, ck.clickAt, F).cur;
  assert.ok(cur.x < 0.15 * F.W && cur.y < 0.03 * F.H && cur.opacity === 1, 'курсор на кнопке в момент клика');
  assert.ok(proofState(ck, ck.clickAt + CLICK.press / 2, F).press < 0.95, 'кнопка проседает при нажатии');
  assert.equal(proofState(ck, ck.clickAt + 1, F).cur.opacity, 0, 'курсор ушёл');

  // клик не дублирует подпись: «Подпишись» под кнопкой «Подписаться» — дубль; в примере подпись без слова кнопки
  const capsHud = hud.captions.map((c) => ({from: c.from, to: c.to, text: c.items.map((w) => w.w).join(' ')}));
  assert.deepEqual(clickDuplicates(L, capsHud), [], 'в примере клик не повторяет подпись');
  assert.equal(clickDuplicates([{word: 'клик', at: 12, to: 15}], [{from: 12, to: 15, text: 'Подпишись, чтобы не пропустить'}]).length, 1, 'Подпишись = Подписаться');
  assert.equal(clickDuplicates([{word: 'клик', at: 12, to: 15, label: 'Subscribe', done: 'Subscribed'}], [{from: 13, to: 15, text: 'Subscribe for more'}]).length, 1, 'Subscribe = Subscribed');
  assert.equal(clickDuplicates([{word: 'клик', at: 12, to: 15}], [{from: 9, to: 12, text: 'Подпишись'}]).length, 0, 'подпись до клика — не дубль');

  // вспышка: пик на склейке, вне окна ноль
  assert.equal(flashState(2.8, 3), 0); assert.equal(flashState(3, 3), FLASH.peak); assert.equal(flashState(3 + FLASH.post, 3), 0);

  // ошибки сценария называют вставку и поле
  const bad = (q, re) => assert.throws(() => validateProofs([q], {duration: 16, videos: hud.videos}), re);
  bad({word: 'лупа', video: 'lupa', at: 7.4, to: 9.6}, /лупе нужны video .* crop/);
  bad({word: 'лупа', video: 'lupa', crop: [0.5, 0.2, 0.3, 0.1], x: 0.5, at: 7.4, to: 9.6}, /у лупы x считается/);
  bad({word: 'лупа', video: 'lupa', crop: [0.5, 0.2, 0.3, 0.1], zoom: 3, at: 7.4, to: 9.6}, /zoom — увеличение/);
  bad({word: 'титр', at: 1, to: 3}, /нет text/);
  bad({word: 'клик', at: 12, to: 15, clickAt: 12.2}, /clickAt/);
  bad({kind: 'box', rect: [0.1, 0.1, 0.2, 0.2], look: 'circle', at: 1, to: 3}, /look — frame или corners/);
  bad({word: 'стрелка', at: 1, to: 3}, /proofs\[0\]: неизвестное слово «стрелка»/);
}

console.log('proofs: одиннадцать видов и слова вставок (уголки, лупа, титр, тревога, клик, вспышка), кадр при перемотке тот же, вход 0,45 с и уход 0,4 с, жизнь после посадки, дорожки, замер, снимок, дорога, полоса света, ошибки сценария проверены');
