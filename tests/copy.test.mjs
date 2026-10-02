import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(text => text.includes('execCommand'));
const prompt = 'Полный промпт\nВторая строка';
function fixture({secure = true, clipboard = 'success', legacy = true} = {}) {
  let click, copied, selected = false;
  const children = [];
  const status = {textContent: ''};
  const classes = new Set();
  const button = {textContent: 'Скопировать промпт', classList: {
    add: name => classes.add(name), remove: name => classes.delete(name)}};
  const target = {innerText: ` ${prompt} `};
  const document = {
    documentElement: {},
    addEventListener: (name, handler) => { if (name === 'click') click = handler; },
    querySelector: selector => { assert.equal(selector, '#prompt .cmd'); return target; },
    getElementById: id => { assert.equal(id, 'copy-status'); return status; },
    getElementsByClassName: () => [],
    body: {appendChild: node => children.push(node), removeChild: node => children.splice(children.indexOf(node), 1)},
    createElement: () => ({style: {}, setAttribute() {}, select() { copied = this.value; }}),
    execCommand: name => { assert.equal(name, 'copy'); if (legacy === 'throw') throw Error('denied'); return legacy; },
    createRange: () => ({selectNodeContents: node => { assert.equal(node, target); selected = true; }})
  };
  const navigator = clipboard === 'missing' ? {} : {clipboard: {writeText: text => {
    copied = text;
    if (clipboard === 'throw') throw Error('denied');
    return clipboard === 'reject' ? Promise.reject(Error('denied')) : Promise.resolve();
  }}};
  const window = {isSecureContext: secure, location: {}, getSelection: () => ({removeAllRanges() {}, addRange() {}})};
  vm.runInNewContext(script, {document, navigator, window, setTimeout: () => 0});
  return {async click() { click({target: {closest: () => button}}); await new Promise(resolve => setImmediate(resolve)); },
    button, status, classes, children, window, get copied() {return copied;}, get selected() {return selected;}};
}
for (const [name, options] of [
  ['secure clipboard success', {}],
  ['clipboard rejection uses working fallback', {clipboard:'reject'}],
  ['clipboard sync error uses working fallback', {clipboard:'throw'}],
  ['missing clipboard uses working fallback', {clipboard:'missing'}],
  ['insecure context uses working fallback', {secure:false}]
]) test(name, async () => {
  const f=fixture(options); await f.click();
  assert.equal(f.copied,prompt); assert.equal(f.button.textContent,'Скопировано ✓');
  assert.ok(f.classes.has('done')); assert.equal(f.children.length,0);
  assert.equal(f.status.textContent,'Промпт скопирован.');
});
for (const legacy of [false,'throw']) test(`failed fallback (${legacy}) never claims success`, async () => {
  const f=fixture({clipboard:'reject',legacy}); await f.click();
  assert.equal(f.button.textContent,'Выделить промпт'); assert.ok(!f.classes.has('done'));
  assert.equal(f.children.length,0); assert.ok(f.selected); assert.equal(f.window.location.hash,'prompt');
  assert.match(f.status.textContent,/Не удалось/);
});
test('copy handler tolerates repeated attempts', async () => {
  const f=fixture({clipboard:'reject',legacy:false}); await f.click(); await f.click();
  assert.equal(f.children.length,0); assert.equal(f.button.textContent,'Выделить промпт');
});
