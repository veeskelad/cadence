// node engine/lib/timing-kit.test.mjs — набор, нормы чтения, сетка долей, касание, раскладка телефона
import assert from 'node:assert/strict';
import {typing, typedAt, readSec, assertReadable, beatGrid, snapToGrid, touchAt} from './timing-kit.js';
import {PHONE, phoneLayout} from './phone.js';

const ty = typing('привет', 1, 1.6);
assert.equal(ty.chars.length, 6);
assert.equal(ty.chars.at(-1), 1.6);
assert.equal(typedAt(ty, 0.9), '');
assert.equal(typedAt(ty, 1.2), 'пр');
assert.equal(typedAt(ty, 5), 'привет');
assert.ok(Math.abs(typing('a'.repeat(17), 0).t1 - 1) < 1e-9, 'без t1 — 17 знаков в секунду');

assert.equal(readSec('Готово'), 0.8);
assert.equal(readSec('два слова'), 1.2);
assert.equal(readSec('один два три четыре пять шесть'), 1.8);
assert.equal(assertReadable([{id: 'a', text: 'два слова', shown: [0, 1.1]}]), 1, 'в пределах допуска 15 %');
assert.throws(() => assertReadable([{id: 'b', text: 'один два три четыре пять шесть', shown: [0, 1]}]), /b: держится 1.00 с/);

assert.deepEqual(beatGrid([0.5, 1.0, 1.5, 2.0, 9], 1.0, 5), [0, 0.5, 1]);
assert.equal(snapToGrid(0.7, [0, 0.5, 1]), 0.5);
assert.equal(snapToGrid(0.7, [0, 0.5, 1], true), 0.75);

const touch = {enter: 1, press: 2, leave: 3};
assert.equal(touchAt(0.5, touch).visible, false);
assert.equal(touchAt(2, touch).travel, 1);
assert.equal(touchAt(2.05, touch).press, 1);
assert.equal(touchAt(2.5, touch).press, 0);

const L = phoneLayout(1080, 1920, {scale: 1.3, top: 478});
assert.ok(Math.abs(L.x + L.width / 2 - 540) < 1e-9, 'по центру');
assert.ok(Math.abs(L.width / L.height - PHONE.body[0] / PHONE.body[1]) < 1e-9, 'пропорции корпуса');
assert.ok(L.screen.x > L.x && L.screen.y > L.y && L.screen.x + L.screen.width < L.x + L.width, 'экран внутри корпуса');
console.log('timing-kit: набор, чтение, доли, касание и телефон проверены');
