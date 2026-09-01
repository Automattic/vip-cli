#!/usr/bin/env bash
set -euo pipefail
# Pack vip-next + go-search-replace into dist/vip-next-<os>-<arch>.tar.gz
# Usage: pack-release.sh <goos> <goarch> <vip-next-path> <helper-path>

os="${1:?}"
arch="${2:?}"
bin="${3:?}"
helper="${4:?}"

stage="$(mktemp -d)"
trap 'rm -rf "${stage}"' EXIT

if [ "${os}" = windows ]; then
	cp "${bin}" "${stage}/vip-next.exe"
	cp "${helper}" "${stage}/go-search-replace.exe"
	chmod +x "${stage}/vip-next.exe" "${stage}/go-search-replace.exe"
	tar -czf "dist/vip-next-windows-${arch}.tar.gz" -C "${stage}" vip-next.exe go-search-replace.exe
else
	cp "${bin}" "${stage}/vip-next"
	cp "${helper}" "${stage}/go-search-replace"
	chmod +x "${stage}/vip-next" "${stage}/go-search-replace"
	tar -czf "dist/vip-next-${os}-${arch}.tar.gz" -C "${stage}" vip-next go-search-replace
fi
