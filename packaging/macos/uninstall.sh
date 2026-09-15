#!/bin/sh
set -eu
# Remove only installer-owned files. User configuration and credentials are
# stored elsewhere and are not touched. No recursive removal is used.
base=/usr/local/lib/vip-cli
pathfile=/etc/paths.d/vip-cli
[ "$(id -u)" -eq 0 ] || { echo "Run: sudo $base/uninstall.sh" >&2; exit 1; }
for dir in /usr /usr/local /usr/local/lib "$base" "$base/bin" /etc/paths.d; do
  [ ! -L "$dir" ] || { echo "Refusing symlinked path: $dir" >&2; exit 1; }
done
marker="$base/bin/.vip-next-installer.json"
[ -f "$marker" ] && [ ! -L "$marker" ] && [ "$(cat "$marker")" = '{"schema":1,"manager":"pkg"}' ] || {
  echo 'This directory is not owned by the VIP CLI installer.' >&2; exit 1;
}
if [ -e "$pathfile" ] || [ -L "$pathfile" ]; then
  [ ! -L "$pathfile" ] && [ -f "$pathfile" ] && [ "$(cat "$pathfile")" = '/usr/local/lib/vip-cli/bin' ] || {
    echo 'PATH entry has changed; inspect it before uninstalling.' >&2; exit 1;
  }
  rm "$pathfile"
fi
rm -f "$base/bin/vip-next" "$base/bin/go-search-replace" "$marker" "$base/package-version" "$base/LICENSE" "$base/uninstall.sh"
rmdir "$base/bin" "$base" 2>/dev/null || true
pkgutil --forget com.automattic.vip-cli
echo 'VIP CLI removed. Open a new terminal to refresh PATH.'
