#!/usr/bin/env python3
"""Offline reference-execution tests for the exact #prompt .cmd prose contract.
No shipped installer or downloaded package code is executed. Requires --archive.
"""
from pathlib import Path
from html.parser import HTMLParser
import argparse
import hashlib
import io
import json
import os
import shutil
import sys
import tempfile
import unittest

import reference_execution as ref

PROMPT_SHA256 = '7fc0902234680f1a1f4cd1c14806387612997095a3f9f24a7f5355b1085f2ba5'
PINNED_RELEASE = {
    'schema': 'cadence.release-pointer.v1',
    'installer_contract': 'cadence.install-prompt.v1',
    'product': 'Cadence',
    'channel': 'public',
    'version': '1.2',
    'release_id': 'cadence-1.2',
    'archive_url': 'https://veeskelad.github.io/cadence/1.2/cadence-1.2.zip',
    'archive_filename': 'cadence-1.2.zip',
    'sha256': 'aea11c3d5cd85a61c4a7e826fa34eede10837d9bdfcf07ad09102be8d573cc88',
    'archive_size_bytes': 2369392,
    'max_expanded_bytes': 33554432,
    'verified_files': 228,
    'published_at': '2026-10-01',
    'fresh_install_tested': True,
    'tested_update_from': ['cadence-1.1'],
}


class PromptParser(HTMLParser):
    """Extract visible text from the single .cmd descendant of #prompt."""
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
            'meta', 'param', 'source', 'track', 'wbr'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.capture_depth = None
        self.matches = []
        self.current = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        in_prompt = attrs.get('id') == 'prompt' or any(self.stack)
        if tag not in self.VOID:
            self.stack.append(in_prompt)
        if in_prompt and 'cmd' in attrs.get('class', '').split():
            if self.capture_depth is not None:
                raise ValueError('Nested prompt commands are unsupported')
            self.capture_depth = len(self.stack)
            self.current = []

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        if self.capture_depth == len(self.stack):
            self.matches.append(''.join(self.current).strip())
            self.capture_depth = None
        if self.stack:
            self.stack.pop()

    def handle_data(self, data):
        if self.capture_depth is not None:
            self.current.append(data)


def extract_prompt(html_file):
    parser = PromptParser()
    parser.feed(html_file.read_text(encoding='utf-8'))
    parser.close()
    if len(parser.matches) != 1:
        raise ValueError('Expected exactly one #prompt .cmd element')
    return parser.matches[0]


class OfflineReleaseSources:
    """Pinned HTTP-response fixture. Never invokes an HTTP client."""
    def __init__(self, archive):
        self.archive = archive
        self.pointer_reads = 0
        self.archive_reads = 0

    def open(self, url, timeout=None):
        if url == ref.POINTER:
            self.pointer_reads += 1
            return io.BytesIO(json.dumps(PINNED_RELEASE).encode('utf-8'))
        if url == PINNED_RELEASE['archive_url']:
            self.archive_reads += 1
            return self.archive.open('rb')
        raise AssertionError('Unexpected URL requested by offline test')


def snapshot(root, exclude_staging=False):
    result = {}
    for directory, dirs, files in os.walk(root, followlinks=False):
        if exclude_staging and Path(directory) == root:
            dirs[:] = [name for name in dirs if not name.startswith('.cadence-stage-')]
        for name in dirs + files:
            path = Path(directory) / name
            relative = path.relative_to(root).as_posix()
            if path.is_symlink():
                result[relative] = ('symlink', os.readlink(path))
            elif path.is_file():
                result[relative] = ('file', hashlib.sha256(path.read_bytes()).hexdigest(),
                                    path.stat().st_size, path.stat().st_mtime_ns)
            else:
                result[relative] = ('directory',)
    return result


class InstallPromptTests(unittest.TestCase):
    archive = None
    prompt = None

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='cadence-prompt-smoke-')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.opened = self.base / 'opened'
        self.opened.mkdir()
        self.sources = OfflineReleaseSources(self.archive)
        self.original_opener = ref.OPENER
        ref.OPENER = self.sources
        self.addCleanup(setattr, ref, 'OPENER', self.original_opener)

    def fresh(self):
        result = ref.install(self.opened)
        self.release = self.opened / 'releases' / PINNED_RELEASE['release_id']
        return result

    def assert_refusal(self, step, root=None, keep_staging=False):
        root = root or self.opened
        before = snapshot(root, exclude_staging=keep_staging)
        with self.assertRaises(ref.Stop) as error:
            ref.install(root)
        self.assertTrue(str(error.exception).startswith(f'Step {step}: '))
        self.assertEqual(before, snapshot(root, exclude_staging=keep_staging))
        if keep_staging:
            self.assertTrue(any(root.glob('.cadence-stage-*')))
        return str(error.exception)

    def test_01_exact_html_prompt(self):
        self.assertEqual(hashlib.sha256(self.prompt.encode('utf-8')).hexdigest(), PROMPT_SHA256)

    def test_02_fresh_install_and_handoff(self):
        result = self.fresh()
        self.assertEqual(result['mode'], 'новая установка')
        self.assertEqual(result['active_release'], 'releases/cadence-1.2')
        self.assertEqual(result['verified_files'], 228)
        self.assertEqual(result['expanded_bytes'], 4445611)
        self.assertIn('отдельный проект', result['handoff'])
        for name in ('AGENTS.md', 'CLAUDE.md', 'INSTALL-PROMPT.txt'):
            self.assertTrue((self.release / name).is_file())
        self.assertFalse(list(self.opened.glob('.cadence-stage-*')))

    def test_03_repeat_is_byte_identical(self):
        self.fresh()
        before = snapshot(self.opened)
        first_archive_reads = self.sources.archive_reads
        result = ref.install(self.opened)
        self.assertEqual(result['mode'], 'уже актуально')
        self.assertEqual(before, snapshot(self.opened))
        self.assertEqual(self.sources.archive_reads, first_archive_reads + 1)
        self.assertEqual(len(before), 323)

    def test_04_single_file_tamper_rejected(self):
        self.fresh()
        (self.release / 'README.md').write_text('Synthetic tamper fixture.\n')
        self.assertIn('File hash mismatch', self.assert_refusal(7, keep_staging=True))

    def test_05_coordinated_manifest_tamper_rejected(self):
        self.fresh()
        target = self.release / 'README.md'
        target.write_text('Synthetic coordinated tamper fixture.\n')
        path = self.release / 'manifest.json'
        manifest = json.loads(path.read_text())
        manifest['files']['README.md'] = hashlib.sha256(target.read_bytes()).hexdigest()
        path.write_text(json.dumps(manifest))
        self.assertIn('File hash mismatch', self.assert_refusal(7, keep_staging=True))

    def test_06_manifest_byte_change_rejected(self):
        self.fresh()
        path = self.release / 'manifest.json'
        path.write_bytes(path.read_bytes() + b'\n')
        self.assertIn('manifest bytes mismatch', self.assert_refusal(7, keep_staging=True))

    def test_07_extra_local_files_preserved(self):
        self.fresh()
        path = self.release / 'node_modules' / 'synthetic.txt'
        path.parent.mkdir()
        path.write_text('Synthetic dependency stand-in; never executed.\n')
        before = snapshot(self.opened)
        ref.install(self.opened)
        self.assertEqual(before, snapshot(self.opened))

    def test_08_active_release_alias_rejected(self):
        self.fresh()
        alias = self.release.parent / 'alias'
        shutil.copytree(self.release, alias)
        (alias / 'README.md').write_text('Unverified alias fixture.\n')
        marker_path = self.opened / '.cadence-install.json'
        marker = json.loads(marker_path.read_text())
        marker['active_release'] = 'releases/alias'
        marker_path.write_text(json.dumps(marker))
        self.assertIn('alias or path mismatch', self.assert_refusal(3))

    def test_09_nonempty_parent_preserved(self):
        sentinel = self.opened / 'unrelated.txt'
        sentinel.write_text('Synthetic unrelated sentinel.\n')
        before = snapshot(self.opened)['unrelated.txt']
        ref.install(self.opened)
        self.assertEqual(before, snapshot(self.opened)['unrelated.txt'])
        self.assertTrue((self.opened / 'Cadence' / '.cadence-install.json').is_file())
        self.assertFalse((self.opened / 'Cadence' / 'Cadence').exists())

    def test_10_conflicting_child_preserved(self):
        child = self.opened / 'Cadence'
        child.mkdir()
        (child / 'keep.txt').write_text('Synthetic conflict sentinel.\n')
        self.assert_refusal(1)
        self.assertEqual(self.sources.archive_reads, 0)

    @unittest.skipUnless(os.name == 'posix', 'POSIX symlink fixture only')
    def test_11_releases_symlink_rejected(self):
        target = self.base / 'target'
        target.mkdir()
        (target / 'keep.txt').write_text('Synthetic symlink sentinel.\n')
        before = snapshot(target)
        (self.opened / '.cadence-install.json').write_text('{}')
        (self.opened / 'releases').symlink_to(target, target_is_directory=True)
        self.assert_refusal(1)
        self.assertEqual(before, snapshot(target))
        self.assertEqual(self.sources.archive_reads, 0)

    @unittest.skipUnless(os.name == 'posix', 'POSIX symlink fixture only')
    def test_14_payload_symlink_rejected(self):
        self.fresh()
        payload = self.release / 'README.md'
        target = self.base / 'outside-readme.txt'
        target.write_bytes(payload.read_bytes())
        original = target.read_bytes()
        payload.unlink()
        payload.symlink_to(target)
        self.assert_refusal(7, keep_staging=True)
        self.assertEqual(target.read_bytes(), original)
        self.assertTrue(payload.is_symlink())

    def set_synthetic_old_version(self, version):
        self.fresh()
        old = self.release.parent / 'cadence-1.1'
        self.release.rename(old)
        marker_path = self.opened / '.cadence-install.json'
        marker = json.loads(marker_path.read_text())
        marker.update(release_id='cadence-1.1', version=version,
                      active_release='releases/cadence-1.1')
        marker_path.write_text(json.dumps(marker))
        manifest_path = old / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        manifest.update(release_id='cadence-1.1', product_version=version)
        manifest_path.write_text(json.dumps(manifest))

    def test_12_numeric_downgrade_rejected(self):
        self.set_synthetic_old_version('1.10')
        self.assertIn('Downgrade prohibited', self.assert_refusal(3))

    def test_13_unknown_version_rejected(self):
        self.set_synthetic_old_version('unknown')
        self.assertIn('Version ordering is ambiguous', self.assert_refusal(3))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', required=True, type=Path,
                        help='Explicitly supplied official cadence-1.2.zip; never executed')
    parser.add_argument('--html', type=Path,
                        default=Path(__file__).resolve().parents[2] / 'index.html',
                        help='Defaults to repository-root index.html')
    args = parser.parse_args()
    if not args.archive.is_file() or args.archive.is_symlink():
        parser.error('The archive must be an ordinary file')
    if args.archive.stat().st_size != PINNED_RELEASE['archive_size_bytes']:
        parser.error('Archive size does not match the pinned public release')
    if ref.sha_file(args.archive) != PINNED_RELEASE['sha256']:
        parser.error('Archive SHA-256 does not match the pinned public release')
    prompt = extract_prompt(args.html)
    if hashlib.sha256(prompt.encode('utf-8')).hexdigest() != PROMPT_SHA256:
        parser.error('HTML prompt changed; review the prose contract and update the reference test deliberately')
    InstallPromptTests.archive = args.archive
    InstallPromptTests.prompt = prompt
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(InstallPromptTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    sys.exit(main())
