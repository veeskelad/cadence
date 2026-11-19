// node engine/lib/board-icons.test.mjs — значки досок: только залитые фигуры без stroke и <text>, цвета только из палитры,
// обёртка icon(), русские имена, ошибка на незнакомом имени
import assert from 'node:assert/strict';
import {ALIASES, ICONS, icon, iconNames} from './board-icons.js';

// метки-цвета не являются префиксами друг друга, поэтому проверка «цвет есть в значке» честная
const COL = {a: 'var(--t-a1)', b: 'var(--t-b2)', c: 'var(--t-c3)', ink: 'var(--t-ink4)', paper: 'var(--t-paper5)', dark: 'var(--t-dark6)'};
const ALLOWED_FILLS = new Set(Object.values(COL));
const ALLOWED_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'g']);
let count = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); count++; };

const names = iconNames();
ok(names.length >= 60, `значков не меньше 60 (есть ${names.length})`);
ok(names.length === new Set(names).size, 'имена не повторяются');

for (const name of names) {
  const inner = ICONS[name](COL);
  ok(typeof inner === 'string' && inner.length > 0, `${name}: непустая разметка`);
  ok(!inner.includes('<svg'), `${name}: только внутренняя разметка, без <svg>`);
  ok(!inner.includes('<text'), `${name}: без <text>`);
  ok(!/stroke/i.test(inner), `${name}: без stroke`);
  ok(!inner.includes('fill="none"'), `${name}: без пустой заливки`);
  ok(!/NaN|undefined|Infinity/.test(inner), `${name}: числа посчитаны`);
  ok(!/\bid=|<defs|<use|clip-path|mask=/.test(inner), `${name}: без id, defs, use, clipPath и масок`);
  ok(inner.includes(`fill="${COL.a}"`), `${name}: основной цвет c.a есть`);

  const tags = [...inner.matchAll(/<\s*([a-zA-Z]+)/g)].map((m) => m[1]);
  ok(tags.length > 0 && tags.every((t) => ALLOWED_TAGS.has(t)), `${name}: только ${[...ALLOWED_TAGS].join('/')} (есть ${[...new Set(tags)]})`);

  const fills = [...inner.matchAll(/fill="([^"]*)"/g)].map((m) => m[1]);
  ok(fills.every((f) => ALLOWED_FILLS.has(f)), `${name}: заливки только из палитры (есть ${[...new Set(fills)].join(', ')})`);
  const used = new Set(fills);
  ok(used.size >= 2 && used.size <= 4, `${name}: 2–4 цвета (есть ${used.size})`);

  // каждая фигура, кроме <g>, залита: fill на самом элементе
  const shapes = [...inner.matchAll(/<(path|rect|circle|ellipse|polygon)\b[^>]*>/g)].map((m) => m[0]);
  ok(shapes.every((s) => /\sfill="/.test(s)), `${name}: у каждой фигуры свой fill`);

  // без волосков: прямоугольники и круги не тоньше 3 единиц (3,6 px при 120 px)
  for (const s of shapes) {
    const w = s.match(/\swidth="([\d.]+)"/), h = s.match(/\sheight="([\d.]+)"/), r = s.match(/\sr="([\d.]+)"/);
    if (w && h) ok(Math.min(+w[1], +h[1]) >= 3, `${name}: прямоугольник не тоньше 3 — ${s}`);
    if (r) ok(+r[1] >= 2, `${name}: круг не меньше r=2 — ${s}`);
  }

  // координаты rect и circle — в поле 100×100 (значок не вылезает за рамку)
  for (const s of shapes) {
    const x = s.match(/\s(?:x|cx)="(-?[\d.]+)"/), y = s.match(/\s(?:y|cy)="(-?[\d.]+)"/);
    if (x && y && !s.includes('transform')) ok(+x[1] >= 0 && +x[1] <= 100 && +y[1] >= 0 && +y[1] <= 100, `${name}: фигура в поле — ${s}`);
  }

  const full = icon(name, COL);
  ok(full.startsWith('<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">') && full.endsWith('</svg>'), `${name}: icon() оборачивает`);
  ok(full.includes(inner), `${name}: icon() внутри — та же разметка`);
}

// русские имена
for (const [ru, en] of Object.entries(ALIASES)) {
  ok(Object.hasOwn(ICONS, en), `ALIASES «${ru}» → ${en}: такой значок есть`);
  ok(icon(ru, COL) === icon(en, COL), `icon(«${ru}») — тот же значок, что ${en}`);
}
ok(ALIASES.search === 'magnifier' && !Object.hasOwn(ICONS, 'search'), 'search — синоним лупы, а не отдельный значок');
ok(ALIASES['кубок'] === 'trophy' && ALIASES['поиск'] === 'magnifier', 'ключевые русские имена на месте');
// каждый значок можно позвать по-русски
const reached = new Set(Object.values(ALIASES));
ok(names.every((n) => reached.has(n)), `у каждого значка есть русское имя (нет у ${names.filter((n) => !reached.has(n))})`);

// незнакомое имя
assert.throws(() => icon('нет-такого', COL), /незнакомый значок/); count++;
assert.throws(() => icon('constructor', COL), /незнакомый значок/); count++;
assert.throws(() => icon('toString', COL), /незнакомый значок/); count++;

// без цветов — палитра по умолчанию, тоже без stroke
ok(!/stroke/.test(icon('trophy')) && icon('trophy').includes('fill="#'), 'icon() без цветов берёт палитру по умолчанию');

console.log(`ok ${count}`);
