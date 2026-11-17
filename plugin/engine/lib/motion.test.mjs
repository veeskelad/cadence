// node engine/lib/motion.test.mjs — пружины по ролям: сходятся, отскок по роли, растяжка
import assert from 'node:assert/strict';
import {SPRINGS, STAGGER, springRole, springParams, stretch} from './motion.js';

const peak = (role) => Math.max(...Array.from({length: 300}, (_, i) => springRole(i / 100, role)));
for (const role of Object.keys(SPRINGS)) {
  assert.ok(Math.abs(springRole(3, role) - 1) < 1e-3, `${role} сходится к 1`);
  assert.equal(springRole(0, role), 0);
}
assert.ok(peak('pop') > peak('settle') && peak('settle') > peak('follow'), 'хлопок прыгает сильнее приземления, приземление — сильнее следования');
assert.ok(peak('follow') < 1.02, 'следование почти без перелёта');
const [lead, trail] = stretch(0.08, 0, 100);
assert.ok(lead > trail, 'ведущий край впереди отстающего');
assert.ok(Math.abs(springParams([900, 50])[0] - 30) < 1e-9);
assert.equal(STAGGER, 0.045);
console.log('motion: пружины по ролям, отскок и растяжка проверены');
