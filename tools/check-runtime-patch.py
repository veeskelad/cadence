#!/usr/bin/env python3
"""Apply/test the review patch in a new temporary copy of public Cadence 1.2.

Never changes the provided ZIP, an installed Cadence, or current/manifest.json.
Requires Python 3.11+, Node 22+, and git. No network or dependency installation.
Usage: python3 tools/check-runtime-patch.py /path/to/cadence-1.2.zip
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import subprocess
import tempfile
import zipfile

ARCHIVE_SHA = 'aea11c3d5cd85a61c4a7e826fa34eede10837d9bdfcf07ad09102be8d573cc88'
ARCHIVE_BYTES = 2369392
ROOT = 'cadence-1.2'
MAX_EXPANDED = 33554432
REPOSITORY = Path(__file__).resolve().parents[1]

def extract_verified(archive: Path, destination: Path) -> Path:
    if archive.stat().st_size != ARCHIVE_BYTES:
        raise ValueError('Expected the unchanged public cadence-1.2.zip (size mismatch)')
    if hashlib.sha256(archive.read_bytes()).hexdigest() != ARCHIVE_SHA:
        raise ValueError('Expected the unchanged public cadence-1.2.zip (SHA-256 mismatch)')
    with zipfile.ZipFile(archive) as source:
        names, payloads, size = set(), {}, 0
        for item in source.infolist():
            path = PurePosixPath(item.filename)
            canonical = item.filename.rstrip('/').casefold()
            mode = stat.S_IFMT(item.external_attr >> 16)
            if (path.is_absolute() or '..' in path.parts or '\\' in item.filename
                    or ':' in item.filename or not path.parts or path.parts[0] != ROOT
                    or canonical in names or mode not in (0, stat.S_IFDIR, stat.S_IFREG)):
                raise ValueError('Unsafe or duplicate archive entry')
            names.add(canonical)
            if item.is_dir():
                continue
            data = source.read(item)
            size += len(data)
            if size > MAX_EXPANDED:
                raise ValueError('Expanded archive is too large')
            payloads[path.relative_to(ROOT).as_posix()] = data
        manifest = json.loads(payloads['manifest.json'])
        if (manifest['product'] != 'Cadence' or manifest['release_id'] != ROOT
                or manifest['product_version'] != '1.2'
                or manifest['schema_version'] != 'cadence-motion-studio.manifest.v1'):
            raise ValueError('Unexpected manifest identity')
        files = manifest['files']
        if len(files) != 228 or set(payloads) != set(files) | {'manifest.json'}:
            raise ValueError('Manifest file set mismatch')
        for name, expected in files.items():
            if hashlib.sha256(payloads[name]).hexdigest() != expected:
                raise ValueError(f'Manifest hash mismatch: {name}')
        target = destination / ROOT
        target.mkdir()
        for name, data in payloads.items():
            path = target / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    return target

def run(command: list[str], cwd: Path) -> None:
    print('+', ' '.join(command), flush=True)
    subprocess.run(command, cwd=cwd, check=True)

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    args = parser.parse_args()
    patch = REPOSITORY / 'patches/cadence-1.2-runtime.patch'
    with tempfile.TemporaryDirectory(prefix='cadence-patch-check-') as directory:
        target = extract_verified(args.archive.resolve(), Path(directory))
        run(['git', 'apply', '--check', str(patch)], target)
        run(['git', 'apply', str(patch)], target)
        tests = sorted(str(path.relative_to(target)) for folder in ('tests', 'engine') for path in (target / folder).glob('*.test.mjs'))
        if not tests:
            raise RuntimeError('Patch did not provide any runtime regression tests')
        run(['node', '--test', *tests], target)
        python_tests = sorted((target / 'tests').glob('test_*.py'))
        if python_tests:
            run(['python3', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py', '-v'], target)
        print('PASS: patch applied and regression tests passed in an isolated copy.')
        print('The published 1.2 ZIP is unchanged. Patched manifests are intentionally not release manifests.')

if __name__ == '__main__':
    main()
