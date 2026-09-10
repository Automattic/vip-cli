#!/usr/bin/env python3
"""Reject links/unsafe entries and verify the identity of an npm artifact."""
import json
import sys
import tarfile
from pathlib import PurePosixPath


def validate(archive, manifest):
    with open(manifest, encoding="utf-8") as source:
        expected = json.load(source)
    seen = set()
    packed = None
    with tarfile.open(archive, "r:gz") as package:
        for entry in package:
            path = PurePosixPath(entry.name)
            if (path.is_absolute() or ".." in path.parts or not path.parts
                    or path.parts[0] != "package" or path.as_posix() in seen):
                raise ValueError(f"Unsafe or duplicate archive entry: {entry.name}")
            seen.add(path.as_posix())
            if entry.islnk() or entry.issym():
                raise ValueError(f"Forbidden archive link: {entry.name} -> {entry.linkname}")
            if not (entry.isfile() or entry.isdir()):
                raise ValueError(f"Unsupported archive entry: {entry.name}")
            if entry.name == "package/package.json":
                packed = json.load(package.extractfile(entry))
    if not packed or any(packed.get(k) != expected.get(k) for k in ("name", "version")):
        raise ValueError("Archive package name/version does not match the source")
    print(f"Validated {packed['name']}@{packed['version']}: {len(seen)} entries, no links")


if __name__ == "__main__":
    validate(*sys.argv[1:])
