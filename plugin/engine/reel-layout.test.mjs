import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeArea, fitText, safeShotContext} from './lib/reel-layout.js';

test('essential rectangle matches conservative 1080x1920 UI margins', () => {
  assert.deepEqual(safeArea(1080, 1920), {
    left: 65, right: 885, top: 288, bottom: 1440, width: 820, height: 1152, cx: 475, cy: 864,
  });
  const half = safeArea(540, 960);
  assert(half.left >= 32.4 && half.right <= 442.8 && half.top >= 144 && half.bottom <= 720);
});

test('per-character advances fit despite whole-word kerning and longer Cyrillic copy', () => {
  const ctx = {font: '', measureText(text) {
    const size = Number(this.font.match(/([\d.]+)px/)[1]);
    // Whole-word kerning is intentionally different from the advances used by the decoder.
    return {width: [...text].length * size * 0.58 * (text.length > 1 ? 0.9 : 1)};
  }};
  for (const text of ['Весь этот ролик', 'AI · video · code', 'Полная система дизайна, монтажа и звука']) {
    const result = fitText(ctx, text, (size) => `400 ${size}px serif`, 250, 672);
    assert(result.width <= 672);
    const center = 475, maximumDepartureScale = 1.14;
    assert(center - result.width / 2 * maximumDepartureScale >= 65);
    assert(center + result.width / 2 * maximumDepartureScale <= 885);
  }
});

test('text clips in canvas coordinates even under a shot zoom or rotation', () => {
  const area = safeArea(1080, 1920), calls = [], states = [];
  let transform = {a: 1.05, b: 0.1, c: -0.1, d: 1.05, e: -30, f: -40};
  const original = transform;
  const ctx = {
    getTransform() { return transform; },
    setTransform(...args) { transform = args.length === 1 ? args[0] : Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].map((k, i) => [k, args[i]])); },
    save() { states.push(transform); }, restore() { transform = states.pop(); },
    beginPath() { calls.push(['begin']); },
    rect(...args) { calls.push(['rect', ...args, transform]); },
    clip() { calls.push(['clip']); },
    fillText(...args) { calls.push(['fillText', ...args, transform]); },
    strokeText(...args) { calls.push(['strokeText', ...args, transform]); },
  };
  const safe = safeShotContext(ctx, area, 1080, 1920);
  for (const method of ['fillText', 'strokeText']) {
    safe[method]('КАДРА', 300, 900);
    const rect = calls.findLast((call) => call[0] === 'rect');
    assert.deepEqual(rect.slice(1, 5), [65, 288, 820, 1152]);
    assert.deepEqual(rect[5], {a: 1, b: 0, c: 0, d: 1, e: 0, f: 0});
    assert.equal(calls.at(-1).at(-1), original);
    assert.equal(transform, original);
    assert.equal(states.length, 0);
  }
});

test('shot background bleeds to full canvas while foreground coordinates stay intact', () => {
  const area = safeArea(1080, 1920), calls = [], stack = [];
  let matrix = 'shot-transform';
  const ctx = {getTransform() { return matrix; }, setTransform(...values) { matrix = values.length === 1 ? values[0] : values; },
    save() { stack.push(matrix); }, restore() { matrix = stack.pop(); },
    fillRect(...args) { calls.push({args, matrix}); }};
  const safe = safeShotContext(ctx, area, 1080, 1920);
  safe.fillRect(area.left, area.top, area.width, area.height);
  assert.deepEqual(calls[0].args, [0, 0, 1080, 1920]);
  assert.deepEqual(calls[0].matrix, [1, 0, 0, 1, 0, 0]);
  assert.equal(matrix, 'shot-transform');
  safe.fillRect(100, 500, 50, 100);
  assert.deepEqual(calls[1], {args: [100, 500, 50, 100], matrix: 'shot-transform'});
});
