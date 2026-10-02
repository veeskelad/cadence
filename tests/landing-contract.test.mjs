import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const prompt = html.match(/<div class="cmd">([\s\S]*?)<\/div>/)?.[1];
const cases = [
  ['filesystem capability prerequisite', /Если у тебя нет доступа к локальной файловой системе/],
  ['same-origin HTTPS retrieval', /Не допускай перенаправления на другой домен или HTTP/],
  ['pre-attached archive is checked', /имени с archive_filename; при несовпадении остановись/],
  ['conflicting directory is refused', /Иначе остановись: не смешивай набор с чужими файлами/],
  ['links and junctions are refused', /symlink, junction или reparse point/],
  ['duplicate ZIP paths are refused', /повторяющиеся и конфликтующие пути/],
  ['fresh ZIP exact file set', /отсутствие пропущенных и лишних файлов/],
  ['manifest excluded from file count', /manifest\.json\nне входит в этот счётчик/],
  ['existing runtime dependencies are not removed', /Дополнительные локальные файлы \(например node_modules\) не удаляй/],
  ['installed release SHA matches pointer', /archive_sha256 должен совпасть\n     с sha256 указателя/],
  ['installed manifest anchored to verified ZIP', /Не доверяй только\n     локальному manifest/],
  ['no unsupported updates', /отсутствует в tested_update_from,\n     ничего не меняй/],
  ['active release is exact, not an alias', /active_release обязан точно равняться `releases\/` \+ локальный release_id/],
  ['no downgrade', /Понижение версии не выполняй/],
  ['atomic activation and create-only release', /create-only[\s\S]*[Аа]томарно запиши/],
  ['no automatic demo/network', /Не запускай\nдемонстрацию, сеть или платные сервисы автоматически/],
];
for(const [name,pattern] of cases) test(`prompt contract: ${name}`, () => {
  assert.ok(prompt); assert.match(prompt,pattern);
});
test('pre-attached ZIP case precedes general nonempty folder case', () => {
  assert.ok(prompt.indexOf('единственный объект') < prompt.indexOf('Иначе, если папка не пустая'));
});
test('all inline scripts parse without running', () => {
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});
test('clipboard error status is accessible', () => {
  assert.match(html,/id="copy-status" role="status" aria-live="polite"/);
});
test('published 1.2 archive remains the immutable patch baseline', () => {
  const archive=readFileSync(new URL('../1.2/cadence-1.2.zip',import.meta.url));
  assert.equal(createHash('sha256').update(archive).digest('hex'),'aea11c3d5cd85a61c4a7e826fa34eede10837d9bdfcf07ad09102be8d573cc88');
});
