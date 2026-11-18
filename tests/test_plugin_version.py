"""Плагин доходит до людей, только когда меняется его номер версии.

Claude Code сравнивает `version` из plugin/.claude-plugin/plugin.json (и записи в marketplace.json):
если номер прежний, новые коммиты в plugin/ у установивших не появятся. Поэтому:
- plugin.json, обе версии в marketplace.json и указатель current/manifest.json называют одну версию;
- plugin/ побайтно совпадает с архивом текущего выпуска;
- plugin/ отличается от базы (по умолчанию origin/main, своя — PLUGIN_BASE) → версия строго выше,
  а прошлая версия перечислена в tested_update_from указателя.

  python3 -m unittest discover -s tests -p "test_plugin_version.py" -v
Перед выкладкой сделать `git fetch origin main`: база сравнивается с тем, что уже опубликовано.
"""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('PLUGIN_BASE', 'origin/main')


def vt(v):
    return tuple(int(x) for x in v.split('.'))


def git(*args):
    return subprocess.run(['git', '-C', str(ROOT), *args], capture_output=True, text=True)


class PluginVersion(unittest.TestCase):
    def setUp(self):
        self.plugin = json.loads((ROOT / 'plugin/.claude-plugin/plugin.json').read_text(encoding='utf-8'))
        self.market = json.loads((ROOT / '.claude-plugin/marketplace.json').read_text(encoding='utf-8'))
        self.pointer = json.loads((ROOT / 'current/manifest.json').read_text(encoding='utf-8'))
        self.v = self.plugin['version']

    def test_one_version_everywhere(self):
        entry = [p for p in self.market['plugins'] if p['name'] == self.plugin['name']]
        self.assertEqual(len(entry), 1, 'в marketplace.json нет записи плагина')
        self.assertEqual(entry[0]['version'], self.v, 'marketplace.json plugins[].version ≠ plugin.json')
        self.assertEqual(self.market['metadata']['version'], self.v, 'marketplace.json metadata.version ≠ plugin.json')
        self.assertEqual(self.pointer['version'], self.v, 'указатель current/manifest.json ≠ plugin.json')

    def test_plugin_is_current_archive(self):
        prefix = self.pointer['release_id'] + '/'
        archive = ROOT / 'releases' / self.v / self.pointer['archive_filename']
        with zipfile.ZipFile(archive) as z:
            names = {n[len(prefix):] for n in z.namelist() if not n.endswith('/')}
            files = {str(p.relative_to(ROOT / 'plugin')) for p in (ROOT / 'plugin').rglob('*') if p.is_file() or p.is_symlink()}
            self.assertEqual(files, names, 'plugin/ и архив выпуска разошлись по составу')
            for n in sorted(names):
                same = hashlib.sha256((ROOT / 'plugin' / n).read_bytes()).digest() == hashlib.sha256(z.read(prefix + n)).digest()
                self.assertTrue(same, f'plugin/{n} ≠ архиву: plugin/ собирается только распаковкой выпуска')

    def test_changed_plugin_has_new_version(self):
        if git('rev-parse', '--verify', '-q', BASE).returncode:
            self.skipTest(f'нет {BASE}: сделай git fetch origin main')
        old = git('show', f'{BASE}:plugin/.claude-plugin/plugin.json')
        if old.returncode:
            self.skipTest(f'в {BASE} ещё нет плагина')
        was = json.loads(old.stdout)['version']
        changed = git('diff', '--quiet', BASE, '--', 'plugin', '.claude-plugin').returncode != 0
        if changed:
            self.assertGreater(vt(self.v), vt(was),
                               f'plugin/ изменился, а версия {self.v} та же, что в {BASE}: подними version, иначе обновление до людей не дойдёт')
        if self.v != was:
            self.assertGreater(vt(self.v), vt(was), f'версия {self.v} ниже опубликованной {was}')
            self.assertIn(f'cadence-{was}', self.pointer['tested_update_from'],
                          f'в tested_update_from нет cadence-{was}: установки папкой получат untested')


if __name__ == '__main__':
    unittest.main()
