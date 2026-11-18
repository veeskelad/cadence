import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const man = JSON.parse(readFileSync(new URL('media/manifest.json', root), 'utf8'));
const byName = new Map(man.files.map(e => [e.file, e]));
const sha = name => createHash('sha256').update(readFileSync(new URL(`media/${name}`, root))).digest('hex');

test('каждый файл каталога на месте и совпадает с манифестом', () => {
  for (const e of man.files) {
    assert.ok(existsSync(new URL(`media/${e.file}`, root)), e.file);
    assert.equal(sha(e.file), e.sha256, `${e.file}: sha256 не совпадает, запусти python3 tools/media_catalog.py`);
    assert.ok(e.used?.length, `${e.file}: не сказано, где используется`);
  }
});

test('в media/ нет файлов вне манифеста', () => {
  const extra = readdirSync(new URL('media/', root)).filter(n => n !== 'manifest.json' && !byName.has(n));
  assert.deepEqual(extra, []);
});

test('у каждого ролика есть постер в каталоге', () => {
  for (const e of man.files.filter(e => e.file.endsWith('.mp4'))) assert.ok(byName.has(e.poster), e.file);
});

test('страница берёт медиа из каталога с актуальной версией', () => {
  const refs = [...html.matchAll(/media\/([\w.-]+)\?v=([0-9a-f]+)/g)];
  assert.ok(refs.length >= 19);
  for (const [, name, v] of refs) {
    assert.ok(byName.has(name), `media/${name} нет в манифесте`);
    assert.equal(v, byName.get(name).sha256.slice(0, 8), `media/${name}: устаревший ?v=`);
  }
  for (const e of man.files.filter(e => e.used.some(u => u.where === 'site')))
    assert.ok(html.includes(`media/${e.file}?v=`), `${e.file} помечен для сайта, но страница на него не ссылается`);
});

test('ролики и картинки не вшиты в страницу', () => {
  assert.doesNotMatch(html, /data:(video|image\/jpeg|image\/png)/);
});
