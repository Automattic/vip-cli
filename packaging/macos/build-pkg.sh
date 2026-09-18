#!/usr/bin/env bash
set -euo pipefail
# Build an unsigned installer from already-signed binaries. Signing is owned
# by the Buildkite caller; local payload tests never need signing credentials.
if [ "$#" -ne 5 ]; then
  echo 'Usage: build-pkg.sh <version> <arm64|amd64> <cli> <helper> <output>' >&2
  exit 1
fi
version="$1"; arch="$2"; cli="$3"; helper="$4"; output="$5"
case "$arch" in
  arm64) host_arch=arm64 ;;
  amd64) host_arch=x86_64 ;;
  *) echo "Unsupported installer architecture: $arch" >&2; exit 1 ;;
esac
repo="$(cd "$(dirname "$0")/../.." && pwd)"
# Inputs are resolved before changing directories; preserve signed bytes.
cli="$(cd "$(dirname "$cli")" && pwd)/$(basename "$cli")"
helper="$(cd "$(dirname "$helper")" && pwd)/$(basename "$helper")"
mkdir -p "$(dirname "$output")"
output="$(cd "$(dirname "$output")" && pwd)/$(basename "$output")"
cd "$repo"
numeric="$(go run -mod=mod ./cmd/installer-version "$version")"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
base="$stage/root/usr/local/lib/vip-cli"
mkdir -p "$base/bin" "$stage/root/etc/paths.d" "$stage/scripts"
cp "$cli" "$base/bin/vip-next"
cp "$helper" "$base/bin/go-search-replace"
chmod 755 "$base/bin/vip-next" "$base/bin/go-search-replace"
printf '%s\n' '{"schema":1,"manager":"pkg"}' > "$base/bin/.vip-next-installer.json"
printf '%s\n' "$numeric" > "$base/package-version"
printf '%s\n' '/usr/local/lib/vip-cli/bin' > "$stage/root/etc/paths.d/vip-cli"
cp LICENSE "$base/LICENSE"
cp packaging/macos/uninstall.sh "$base/uninstall.sh"
chmod 755 "$base/uninstall.sh"
# Only a validated numeric version is substituted into the shell script.
sed "s/@PACKAGE_VERSION@/$numeric/g" packaging/macos/preinstall > "$stage/scripts/preinstall"
chmod 755 "$stage/scripts/preinstall"
pkgbuild --root "$stage/root" --identifier com.automattic.vip-cli \
  --version "$numeric" --install-location / --ownership recommended \
  --scripts "$stage/scripts" "$stage/vip-cli.pkg"
cat > "$stage/Distribution.xml" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
  <title>VIP CLI $version</title>
  <options customize="never" require-scripts="false" hostArchitectures="$host_arch"/>
  <domains enable_anywhere="false" enable_currentUserHome="false" enable_localSystem="true"/>
  <choices-outline><line choice="default"/></choices-outline>
  <choice id="default" visible="false"><pkg-ref id="com.automattic.vip-cli"/></choice>
  <pkg-ref id="com.automattic.vip-cli" version="$numeric" onConclusion="none">vip-cli.pkg</pkg-ref>
</installer-gui-script>
EOF
productbuild --distribution "$stage/Distribution.xml" --package-path "$stage" "$output"
