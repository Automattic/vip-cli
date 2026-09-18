#!/usr/bin/env python3
"""Verify a built PKG's payload without installing it (including signed PKGs)."""
import argparse
from pathlib import Path
import subprocess
import tempfile
import xml.etree.ElementTree as ET


def verify(package, numeric_version, arch, cli, helper):
    repo = Path(__file__).resolve().parents[2]
    with tempfile.TemporaryDirectory() as tmp:
        expanded = Path(tmp) / "expanded"
        subprocess.run(["pkgutil", "--expand-full", str(package), str(expanded)], check=True)
        distribution = ET.parse(expanded / "Distribution")
        expected_arch = {"arm64": "arm64", "amd64": "x86_64"}[arch]
        if distribution.find("options").get("hostArchitectures") != expected_arch:
            raise ValueError("Incorrect installer architecture restriction")
        domains = distribution.find("domains")
        if domains is None or domains.attrib != {"enable_anywhere": "false", "enable_currentUserHome": "false", "enable_localSystem": "true"}:
            raise ValueError("Installer must target the local system volume only")
        component = expanded / "vip-cli.pkg"
        info = ET.parse(component / "PackageInfo").getroot()
        if (info.get("identifier"), info.get("version"), info.get("install-location")) != ("com.automattic.vip-cli", numeric_version, "/"):
            raise ValueError("Incorrect package identity/version/install location")
        prefix = "usr/local/lib/vip-cli/"
        expected = {
            prefix + "bin/vip-next": Path(cli).read_bytes(),
            prefix + "bin/go-search-replace": Path(helper).read_bytes(),
            prefix + "bin/.vip-next-installer.json": b'{"schema":1,"manager":"pkg"}\n',
            prefix + "package-version": (numeric_version + "\n").encode(),
            prefix + "LICENSE": (repo / "LICENSE").read_bytes(),
            prefix + "uninstall.sh": (repo / "packaging/macos/uninstall.sh").read_bytes(),
            "etc/paths.d/vip-cli": b"/usr/local/lib/vip-cli/bin\n",
        }
        payload = component / "Payload"
        files = {}
        for entry in payload.rglob("*"):
            if entry.is_symlink():
                raise ValueError("Unexpected symlink in installer payload")
            if entry.is_file():
                files[entry.relative_to(payload).as_posix()] = entry.read_bytes()
        if files != expected:
            raise ValueError("Installer payload differs from the signed inputs or expected files")
        for executable in ["bin/vip-next", "bin/go-search-replace", "uninstall.sh"]:
            if not (payload / prefix / executable).stat().st_mode & 0o111:
                raise ValueError("Installer payload is missing executable permissions")
        preinstall = (repo / "packaging/macos/preinstall").read_text().replace("@PACKAGE_VERSION@", numeric_version)
        if (component / "Scripts/preinstall").read_text() != preinstall:
            raise ValueError("Installer preinstall script differs from expected version")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package")
    parser.add_argument("numeric_version")
    parser.add_argument("arch", choices=["amd64", "arm64"])
    parser.add_argument("cli")
    parser.add_argument("helper")
    args = parser.parse_args()
    verify(args.package, args.numeric_version, args.arch, args.cli, args.helper)
