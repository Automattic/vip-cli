"""Build and expand real PKGs without installing anything on the host."""
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET

REPO = Path(__file__).resolve().parents[2]


@unittest.skipUnless(platform.system() == "Darwin", "requires macOS packaging tools")
class PackageTests(unittest.TestCase):
    def test_payload_and_preinstall(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            package = tmp / "VIP CLI.pkg"
            subprocess.run(["bash", str(REPO / "packaging/macos/build-pkg.sh"),
                            "5.0.0-beta.1", "arm64", "/bin/echo", "/usr/bin/true", str(package)],
                           cwd=REPO, check=True)
            verify = ["python3", str(REPO / "packaging/macos/verify-pkg.py"), str(package), "5.0.301", "arm64", "/bin/echo", "/usr/bin/true"]
            subprocess.run(verify, check=True)
            # Wrong input bytes must reject the completed package, even if it
            # was successfully produced by the native packaging tools.
            wrong_input = verify[:-1] + ["/bin/echo"]
            result = subprocess.run(wrong_input, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("payload differs", result.stderr)
            expanded = tmp / "expanded"
            subprocess.run(["pkgutil", "--expand-full", str(package), str(expanded)], check=True)
            distribution = ET.parse(expanded / "Distribution")
            self.assertEqual(distribution.find("options").get("hostArchitectures"), "arm64")
            component = expanded / "vip-cli.pkg"
            info = ET.parse(component / "PackageInfo").getroot()
            self.assertEqual(info.get("identifier"), "com.automattic.vip-cli")
            self.assertEqual(info.get("version"), "5.0.301")
            payload = component / "Payload"
            base = payload / "usr/local/lib/vip-cli"
            self.assertEqual((base / "bin/vip-next").read_bytes(), Path("/bin/echo").read_bytes())
            self.assertEqual((base / "bin/go-search-replace").read_bytes(), Path("/usr/bin/true").read_bytes())
            self.assertEqual((base / "bin/.vip-next-installer.json").read_text().strip(), '{"schema":1,"manager":"pkg"}')
            self.assertEqual((payload / "etc/paths.d/vip-cli").read_text(), "/usr/local/lib/vip-cli/bin\n")
            self.assertEqual((base / "package-version").read_text(), "5.0.301\n")
            self.assertTrue(os.access(base / "uninstall.sh", os.X_OK))
            preinstall = component / "Scripts/preinstall"
            target = tmp / "volume"
            target.mkdir()

            def check_install(ok):
                result = subprocess.run(["/bin/sh", str(preinstall), str(package), "/", str(target)], capture_output=True, text=True)
                self.assertEqual(result.returncode == 0, ok, result.stdout + result.stderr)

            check_install(True)
            installed = target / "usr/local/lib/vip-cli"
            installed.mkdir(parents=True)
            (installed / "unrelated").write_text("keep")
            check_install(False)
            self.assertEqual((installed / "unrelated").read_text(), "keep")
            shutil.copytree(base, installed, dirs_exist_ok=True)
            check_install(True)
            (installed / "package-version").write_text("5.0.999\n")
            check_install(False)
            (installed / "package-version").write_text("5.0.100\n")
            check_install(True)
            paths = target / "etc/paths.d"
            paths.mkdir(parents=True)
            (paths / "vip-cli").write_text("/another/tool\n")
            check_install(False)


if __name__ == "__main__":
    unittest.main()
