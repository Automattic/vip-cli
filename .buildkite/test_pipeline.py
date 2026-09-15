"""Exercise the real binary script with unavailable installer signing."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class SigningIsolationTest(unittest.TestCase):
    def test_binary_archives_survive_unavailable_installer_signing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".buildkite").mkdir()
            (root / "tools").mkdir()
            for name in ["build-macos.sh", "pack-release.sh", "build-macos-installer.sh"]:
                shutil.copy2(ROOT / ".buildkite" / name, root / ".buildkite" / name)

            def executable(name, content):
                target = root / name
                target.write_text("#!/usr/bin/env bash\nset -eu\n" + content)
                target.chmod(0o755)

            executable(".buildkite/fetch-search-replace.sh", '''
for arch in arm64 amd64; do
  mkdir -p "third_party/go-search-replace/darwin-$arch"
  printf '#!/bin/sh\\nexit 0\\n' > "third_party/go-search-replace/darwin-$arch/go-search-replace"
done
''')
            executable("tools/go", '''
case "$*" in
  *stamp-version*) echo 5.0.0-alpha.1 ;;
  *installer-version*) echo 5.0.101 ;;
  build*)
    while [ "$1" != -o ]; do shift; done
    printf '#!/bin/sh\\nexit 0\\n' > "$2"
    chmod +x "$2" ;;
esac
''')
            executable("tools/bundle", '''
printf '%s\\n' "$*" >> "$CALL_LOG"
case "$*" in
  *installer*) echo 'Installer certificate unavailable' >&2; exit 1 ;;
esac
''')
            executable("tools/buildkite-agent", 'echo "unexpected artifact operation" >&2; exit 99\n')
            env = dict(os.environ, PATH=str(root / "tools") + os.pathsep + os.environ["PATH"],
                       CALL_LOG=str(root / "calls"), BIN_BASE="vip-next")
            binary = subprocess.run(["bash", ".buildkite/build-macos.sh"], cwd=root, env=env,
                                    capture_output=True, text=True)
            self.assertEqual(binary.returncode, 0, binary.stdout + binary.stderr)
            archives = sorted((root / "dist").glob("*.tar.gz*"))
            self.assertEqual(len(archives), 4)
            before = {p.name: p.read_bytes() for p in archives}
            calls = (root / "calls").read_text()
            self.assertIn("configure_code_signing", calls)
            self.assertNotIn("installer", calls)
            installer = subprocess.run(["bash", ".buildkite/build-macos-installer.sh"], cwd=root,
                                       env=env, capture_output=True, text=True)
            self.assertNotEqual(installer.returncode, 0)
            self.assertIn("Installer certificate unavailable", installer.stderr)
            self.assertEqual(before, {p.name: p.read_bytes() for p in archives})
            self.assertFalse(list((root / "dist").glob("*.pkg*")))


if __name__ == "__main__":
    unittest.main()
