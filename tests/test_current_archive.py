"""Validate the exact current public distribution, not only landing copy."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
class CurrentArchive(unittest.TestCase):
    def setUp(self):
        self.pointer=json.loads((ROOT/'current/manifest.json').read_text())
        self.archive=ROOT/self.pointer['version']/self.pointer['archive_filename']
    def test_pointer_sha_and_immutable_previous_release(self):
        self.assertEqual(self.archive.stat().st_size,self.pointer['archive_size_bytes'])
        self.assertEqual(hashlib.sha256(self.archive.read_bytes()).hexdigest(),self.pointer['sha256'])
        self.assertEqual(hashlib.sha256((ROOT/'1.3/cadence-1.3.zip').read_bytes()).hexdigest(),
                         '2184ace1ce4f3706b55f418b8ae7580cc55cdd2bddba48ab89ba70f3e2e42406')
    def test_exact_verified_payload_and_free_boundary(self):
        prefix=self.pointer['release_id']+'/'
        with zipfile.ZipFile(self.archive) as z:
            manifest=json.loads(z.read(prefix+'manifest.json'))
            self.assertEqual(manifest['release_id'],self.pointer['release_id'])
            self.assertEqual(manifest['product_version'],self.pointer['version'])
            self.assertFalse(manifest['paid_assets_included'])
            self.assertFalse(manifest['provider_keys_included'])
            self.assertEqual(len(manifest['files']),self.pointer['verified_files'])
            self.assertEqual(set(z.namelist()),{prefix+n for n in manifest['files']}|{prefix+'manifest.json'})
            self.assertEqual(len(z.namelist()),len({n.casefold() for n in z.namelist()}))
            for item in z.infolist():
                self.assertTrue(item.filename.startswith(prefix))
                self.assertNotIn('..',PurePosixPath(item.filename).parts)
                self.assertNotIn('\\',item.filename)
                self.assertNotIn(':',item.filename)
                self.assertEqual((item.external_attr>>16)&0o170000,0o100000)
            for name,sha in manifest['files'].items():
                self.assertEqual(hashlib.sha256(z.read(prefix+name)).hexdigest(),sha,name)
            self.assertNotIn('gateway.py',manifest['files'])
    def test_demo_fix_is_in_archive(self):
        prefix=self.pointer['release_id']+'/'
        with zipfile.ZipFile(self.archive) as z:
            template=z.read(prefix+'engine/templates/beat-reel/index.html').decode()
            self.assertIn("from './lib/reel-layout.js'",template)
            self.assertIn('дизайн · моушн · монтаж · звук',template)
            film=json.loads(z.read(prefix+'examples/beat-reel/film.json'))
            self.assertEqual(film['mark']['tag'],'дизайн · моушн · монтаж · звук')
            self.assertTrue(z.read(prefix+'engine/reel-layout.test.mjs'))

if __name__=='__main__':unittest.main()
