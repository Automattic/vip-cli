import importlib.util
import io
import json
import os
import shutil
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('validator', ROOT / 'validate.py')
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class StagedPackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='npm staging test ')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'source'
        self.output = self.root / 'output'
        self.source.mkdir()
        self.output.mkdir()
        self.manifest = {
            'name': 'staging-fixture', 'version': '1.0.0',
            'dependencies': {'native-fixture': '1.0.0'},
            'bundleDependencies': True,
            'scripts': {
                'prepublishOnly': 'node -e "if(process.env.npm_config_tag!==\'next\')process.exit(1)"',
                'prepare': 'node prepare.js',
                'postpack': 'node -e "require(\'fs\').writeFileSync(\'built.txt\',\'changed-after-pack\')"',
                'smoke': 'node smoke.js',
                'test': 'node smoke.js',
            },
        }
        (self.source / 'package.json').write_text(json.dumps(self.manifest))
        dep = self.source / 'node_modules/native-fixture'
        dep.mkdir(parents=True)
        (dep / 'package.json').write_text(json.dumps({'name': 'native-fixture', 'version': '1.0.0'}))
        (self.source / 'prepare.js').write_text('''
const fs = require('fs');
const dir = 'node_modules/native-fixture/';
fs.writeFileSync('built.txt', 'built-before-copy');
fs.writeFileSync(dir + 'original.node', 'native-bytes');
fs.chmodSync(dir + 'original.node', 0o755);
if (fs.existsSync(dir + 'copy.node')) fs.unlinkSync(dir + 'copy.node');
fs.linkSync(dir + 'original.node', dir + 'copy.node');
''')
        (self.source / 'smoke.js').write_text('''
const fs = require('fs');
if (fs.readFileSync('built.txt', 'utf8') !== 'built-before-copy') process.exit(1);
if (fs.readFileSync('node_modules/native-fixture/copy.node', 'utf8') !== 'native-bytes') process.exit(1);
if (process.env.NODE_AUTH_TOKEN) process.exit(1);
''')
        self.env = {**os.environ, 'HOME': str(self.root), 'NODE_AUTH_TOKEN': 'must-not-reach-hooks',
                    'NPM_CONFIG_USERCONFIG': os.devnull, 'NPM_CONFIG_CACHE': str(self.root / 'cache'),
                    'NPM_CONFIG_REGISTRY': 'http://127.0.0.1:9', 'TMPDIR': str(self.root)}

    def pack(self, smoke='smoke'):
        return subprocess.run(['bash', str(ROOT / 'pack.sh'), str(self.source), str(self.output),
                               'next', smoke], env=self.env, text=True, capture_output=True)

    def test_copies_links_and_smokes_exact_archive_without_rebuilding(self):
        result = self.pack()
        self.assertEqual(result.returncode, 0, result.stderr)
        archive = Path(result.stdout.strip())
        self.assertEqual(archive.parent, self.output.resolve())
        with tarfile.open(archive) as package:
            self.assertFalse(any(m.islnk() or m.issym() for m in package))
            for name in ['original.node', 'copy.node']:
                member = package.getmember('package/node_modules/native-fixture/' + name)
                self.assertTrue(member.isfile())
                self.assertEqual(member.mode & 0o777, 0o755)
                self.assertEqual(package.extractfile(member).read(), b'native-bytes')
            self.assertEqual(package.extractfile('package/built.txt').read(), b'built-before-copy')
        dep = self.source / 'node_modules/native-fixture'
        self.assertEqual((dep / 'original.node').stat().st_ino, (dep / 'copy.node').stat().st_ino)
        self.assertEqual((self.source / 'built.txt').read_text(), 'changed-after-pack')
        self.assertEqual(list(self.root.glob('npm-pack-staged.*')), [])

    def test_hook_failure_does_not_produce_an_artifact(self):
        self.manifest['scripts']['prepublishOnly'] = 'node -e "process.exit(7)"'
        (self.source / 'package.json').write_text(json.dumps(self.manifest))
        self.assertNotEqual(self.pack().returncode, 0)
        self.assertEqual(list(self.output.iterdir()), [])

    def test_smoke_failure_does_not_produce_an_artifact(self):
        (self.source / 'smoke.js').write_text('process.exit(8)')
        self.assertNotEqual(self.pack().returncode, 0)
        self.assertEqual(list(self.output.iterdir()), [])
        self.assertEqual(list(self.root.glob('npm-pack-staged.*')), [])

    def test_output_inside_source_is_rejected(self):
        self.output = self.source
        result = self.pack()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('outside the source', result.stderr)

    def test_existing_artifact_is_not_overwritten(self):
        artifact = self.output / 'staging-fixture-1.0.0.tgz'
        artifact.write_bytes(b'keep-me')
        self.assertNotEqual(self.pack().returncode, 0)
        self.assertEqual(artifact.read_bytes(), b'keep-me')

    def test_stable_and_prerelease_publish_the_exact_dry_run_artifact(self):
        commands = self.root / 'commands'
        commands.mkdir()
        real_npm = shutil.which('npm')
        for name, body in {
            'git': r'''#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
with open(os.environ['GIT_LOG'], 'a') as f:
    f.write(json.dumps(args) + '\n')
if args[0] == 'branch':
    print('trunk')
elif args[0] not in ('fetch', 'checkout', 'diff-index', 'config', 'add', 'commit', 'push'):
    sys.exit(9)
''',
            'gh': r'''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
with open(os.environ['GH_LOG'], 'a') as f:
    f.write(json.dumps(args) + '\n')
if args[:2] == ['pr', 'diff']:
    print('package.json')
elif args[:2] == ['pr', 'create']:
    assert 'development version' in Path(args[args.index('--body-file') + 1]).read_text()
    print('https://example.invalid/pull/1')
''',
            'npm': r'''#!/usr/bin/env python3
import hashlib, json, os, subprocess, sys, tarfile
args = sys.argv[1:]
if args[0] == 'view':
    print('0.9.0')
elif args[0] in ('ci', 'rebuild'):
    pass
elif args[0] == 'publish':
    artifact = args[1]
    assert artifact.endswith('.tgz'), args
    assert '--ignore-scripts' in args, args
    with tarfile.open(artifact) as t:
        assert not any(m.islnk() or m.issym() for m in t)
    with open(artifact, 'rb') as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    with open(os.environ['PUBLISH_LOG'], 'a') as f:
        f.write(json.dumps({'args': args, 'sha256': digest}) + '\n')
else:
    sys.exit(subprocess.call([os.environ['REAL_NPM'], *args]))
''',
        }.items():
            script = commands / name
            script.write_text(body)
            script.chmod(0o755)
        # The stable action supplies latest; test the prerelease tag independently.
        self.manifest['scripts']['prepublishOnly'] = 'node -e "if(process.env.NODE_AUTH_TOKEN)process.exit(1)"'
        (self.source / 'package.json').write_text(json.dumps(self.manifest))
        for action in ['npm-publish', 'npm-publish-prerelease']:
            with self.subTest(action=action):
                log = self.root / (action + '.jsonl')
                env = {**self.env, 'PATH': str(commands) + os.pathsep + os.environ['PATH'],
                       'REAL_NPM': real_npm, 'PUBLISH_LOG': str(log), 'CI': 'true',
                       'GIT_LOG': str(log) + '.git', 'GH_LOG': str(log) + '.gh',
                       'GITHUB_ACTIONS': 'true', 'PROVENANCE': 'true',
                       'USE_TRUSTED_PUBLISHING': 'true',
                       'SMOKE_SCRIPT': 'smoke', 'SKIP_BUMP_TO_DEV': 'false',
                       'CONVENTIONAL_COMMITS': 'true', 'PR_ASSIGNEE': 'fixture-actor',
                       'PR_HEAD_REF': 'release/patch--trunk', 'PR_NUMBER': '1', 'NPM_TAG': 'next'}
                result = subprocess.run(['bash', str(ROOT / ('publish.sh' if action == 'npm-publish' else 'publish-prerelease.sh'))],
                                        cwd=self.source, env=env, text=True, capture_output=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                calls = [json.loads(line) for line in log.read_text().splitlines()]
                self.assertEqual(len(calls), 2)
                self.assertEqual(calls[0]['args'][1], calls[1]['args'][1])
                self.assertEqual(calls[0]['sha256'], calls[1]['sha256'])
                self.assertIn('--dry-run', calls[0]['args'])
                self.assertNotIn('--dry-run', calls[1]['args'])
                self.assertIn('--provenance', calls[1]['args'])
                self.assertFalse(Path(calls[1]['args'][1]).exists(), 'temporary artifact must be cleaned')
                expected_tag = 'latest' if action == 'npm-publish' else 'next'
                for call in calls:
                    self.assertEqual(call['args'][call['args'].index('--tag') + 1], expected_tag)
                github_calls = [json.loads(line) for line in Path(str(log) + '.gh').read_text().splitlines()]
                release = next(call for call in github_calls if call[:2] == ['release', 'create'])
                if action == 'npm-publish':
                    self.assertNotIn('--prerelease', release)
                    git_calls = [json.loads(line) for line in Path(str(log) + '.git').read_text().splitlines()]
                    self.assertIn(['checkout', '-b', 'dev-release/v1.0.1-dev.0'], git_calls)
                    pr = next(call for call in github_calls if call[:2] == ['pr', 'create'])
                    self.assertEqual(pr[pr.index('--head') + 1], 'dev-release/v1.0.1-dev.0')
                    self.assertEqual(json.loads((self.source / 'package.json').read_text())['version'], '1.0.1-dev.0')
                else:
                    self.assertIn('--prerelease', release)
                    self.assertFalse(any(call[:2] == ['pr', 'create'] for call in github_calls))


    def test_release_validation_stops_before_install_or_publish(self):
        commands = self.root / 'commands'
        commands.mkdir()
        for name, body in {
            'git': '#!/bin/sh\ncase "$1" in branch) echo "${MOCK_BRANCH:-trunk}" ;; diff-index) exit "${MOCK_DIRTY:-0}" ;; fetch|checkout) ;; *) exit 9 ;; esac\n',
            'gh': '#!/bin/sh\n[ "${MOCK_GH_FAILURE:-0}" = 0 ] || exit 1\nprintf "%s\\n" "${MOCK_PR_FILE:-package.json}"\n',
            'npm': '#!/bin/sh\nif [ "$1" = view ]; then echo 0.9.0; else touch "$UNEXPECTED_NPM"; exit 9; fi\n',
        }.items():
            script = commands / name
            script.write_text(body)
            script.chmod(0o755)
        marker_file = self.root / 'unexpected-npm'
        base = {**self.env, 'PATH': str(commands) + os.pathsep + os.environ['PATH'],
                'PR_HEAD_REF': 'release/patch--trunk', 'PR_NUMBER': '1',
                'USE_TRUSTED_PUBLISHING': 'true', 'UNEXPECTED_NPM': str(marker_file)}
        for script, overrides, code in [
            ('publish.sh', {'MOCK_PR_FILE': 'src/changed.js'}, 200),
            ('publish.sh', {'MOCK_PR_FILE': 'package.json.bak'}, 200),
            ('publish.sh', {'MOCK_GH_FAILURE': '1'}, 1),
            ('publish.sh', {'PR_HEAD_REF': 'release/invalid--trunk'}, 201),
            ('publish.sh', {'MOCK_BRANCH': 'different'}, 203),
            ('publish.sh', {'MOCK_DIRTY': '1'}, 204),
            ('publish-prerelease.sh', {'MOCK_DIRTY': '1'}, 204),
        ]:
            with self.subTest(script=script, overrides=overrides):
                result = subprocess.run(['bash', str(ROOT / script)], cwd=self.source,
                                        env={**base, **overrides}, capture_output=True, text=True)
                self.assertEqual(result.returncode, code, result.stdout + result.stderr)
                self.assertFalse(marker_file.exists())

    def test_validator_rejects_unsafe_archives(self):
        for name, kind, identity in [
            ('package/hard.node', tarfile.LNKTYPE, self.manifest),
            ('package/soft.node', tarfile.SYMTYPE, self.manifest),
            ('package/../escape', tarfile.REGTYPE, self.manifest),
            ('/absolute', tarfile.REGTYPE, self.manifest),
            ('package/device', tarfile.CHRTYPE, self.manifest),
            ('package/package.json', tarfile.REGTYPE, self.manifest),
            ('package/safe', tarfile.REGTYPE, {'name': 'wrong', 'version': '1.0.0'}),
        ]:
            with self.subTest(name=name, kind=kind):
                archive = self.output / 'bad.tgz'
                with tarfile.open(archive, 'w:gz') as package:
                    data = json.dumps(identity).encode()
                    manifest = tarfile.TarInfo('package/package.json')
                    manifest.size = len(data)
                    package.addfile(manifest, io.BytesIO(data))
                    entry = tarfile.TarInfo(name)
                    entry.type = kind
                    if kind in (tarfile.LNKTYPE, tarfile.SYMTYPE):
                        entry.linkname = 'package/package.json'
                    package.addfile(entry)
                with self.assertRaises(ValueError):
                    validator.validate(archive, self.source / 'package.json')


if __name__ == '__main__':
    unittest.main()
