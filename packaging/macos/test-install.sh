#!/usr/bin/env bash
set -euo pipefail
# System installation is restricted to disposable GitHub-hosted macOS runners.
if [ "${VIP_INSTALLER_E2E:-}" != 1 ] || [ "${GITHUB_ACTIONS:-}" != true ] || [ "${RUNNER_ENVIRONMENT:-}" != github-hosted ]; then
  echo 'Installer lifecycle tests require VIP_INSTALLER_E2E=1 on a GitHub-hosted runner.' >&2
  exit 1
fi
base=/usr/local/lib/vip-cli
pathfile=/etc/paths.d/vip-cli
if [ -e "$base" ] || [ -L "$base" ] || [ -e "$pathfile" ] || [ -L "$pathfile" ] || pkgutil --pkg-info com.automattic.vip-cli >/dev/null 2>&1; then
  echo 'Refusing to test over an existing installation or receipt.' >&2
  exit 1
fi
repo="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo"
stage="$(mktemp -d)"
cleanup() {
  if [ -f "$base/bin/.vip-next-installer.json" ] && [ -f "$base/uninstall.sh" ]; then
    sudo /bin/sh "$base/uninstall.sh"
  fi
  rm -rf "$stage"
}
trap cleanup EXIT
case "$(uname -m)" in arm64) arch=arm64 ;; x86_64) arch=amd64 ;; *) exit 1 ;; esac
for v in 5.0.0-alpha.0 5.0.0-alpha.1; do
  go build -buildvcs=false -ldflags="-X main.fixtureVersion=$v" -o "$stage/fixture" ./testdata/installer-fixture
  go build -buildvcs=false -ldflags="-X main.fixtureVersion=$v-helper" -o "$stage/helper" ./testdata/installer-fixture
  bash packaging/macos/build-pkg.sh "$v" "$arch" "$stage/fixture" "$stage/helper" "$stage/$v.pkg"
done
for v in 5.0.0-alpha.0 5.0.0-alpha.1; do
  sudo installer -pkg "$stage/$v.pkg" -target /
  test "$("$base/bin/vip-next" --version)" = "$v"
  test "$("$base/bin/go-search-replace" --version)" = "$v-helper"
  "$base/bin/vip-next" --installer-owner | grep -F '.pkg'
  test "$(cat "$pathfile")" = "$base/bin"
  /bin/zsh -lc 'command -v vip-next' | grep -Fx "$base/bin/vip-next"
done
if sudo installer -pkg "$stage/5.0.0-alpha.0.pkg" -target /; then
  echo 'Downgrade was incorrectly accepted.' >&2
  exit 1
fi
test "$("$base/bin/vip-next" --version)" = 5.0.0-alpha.1
test "$("$base/bin/go-search-replace" --version)" = 5.0.0-alpha.1-helper
sudo /bin/sh "$base/uninstall.sh"
test ! -e "$base"
test ! -e "$pathfile"
if pkgutil --pkg-info com.automattic.vip-cli >/dev/null 2>&1; then
  echo 'Receipt remains after uninstall.' >&2
  exit 1
fi
echo 'macOS installer install/upgrade/downgrade/PATH/ownership/uninstall tests passed.'
