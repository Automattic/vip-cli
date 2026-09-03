#!/usr/bin/env bash
set -euo pipefail
# Fetch go-search-replace for each goos/goarch argument, verify against
# third_party/go-search-replace/MANIFEST, install under that tree.
# Usage: fetch-search-replace.sh darwin/arm64 darwin/amd64
# No args: this host's GOOS/GOARCH.

GSR_DIR=third_party/go-search-replace
GSR_REPO=Automattic/go-search-replace

sha256() {
	if command -v shasum >/dev/null 2>&1; then
		shasum -a 256 "$1" | awk '{ print $1 }'
	else
		sha256sum "$1" | awk '{ print $1 }'
	fi
}

tag="$(awk '$1=="TAG"{print $2}' "${GSR_DIR}/MANIFEST")"
[ -n "${tag}" ] || { echo "no TAG in ${GSR_DIR}/MANIFEST" >&2; exit 1; }

if [ "$#" -eq 0 ]; then
	set -- "$(go env GOOS)/$(go env GOARCH)"
fi

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

for t in "$@"; do
	os="${t%%/*}"
	arch="${t##*/}"
	want="$(awk -v k="${t}" '$1==k{print $2}' "${GSR_DIR}/MANIFEST")"
	if [ -z "${want}" ]; then
		echo "ERROR: ${t} is not pinned in ${GSR_DIR}/MANIFEST" >&2
		exit 1
	fi
	name="go-search-replace_${os}_${arch}"
	if [ "${os}" = windows ]; then
		name="${name}.exe"
	fi
	url="https://github.com/${GSR_REPO}/releases/download/${tag}/${name}.gz"
	echo "  fetching ${name} (${tag})"
	if ! curl -fsSL "${url}" -o "${tmp}/${name}.gz"; then
		echo "ERROR: could not download ${url}" >&2
		exit 1
	fi
	gunzip -f "${tmp}/${name}.gz"
	got="$(sha256 "${tmp}/${name}")"
	if [ "${got}" != "${want}" ]; then
		echo "ERROR: checksum mismatch for ${t}" >&2
		echo "  expected (from upstream SLSA provenance): ${want}" >&2
		echo "  got:                                      ${got}" >&2
		echo "  Refusing to install. Do not bypass this." >&2
		exit 1
	fi
	out="${GSR_DIR}/${os}-${arch}"
	mkdir -p "${out}"
	d="${out}/go-search-replace"
	if [ "${os}" = windows ]; then
		d="${d}.exe"
	fi
	mv "${tmp}/${name}" "${d}"
	chmod +x "${d}"
	echo "  verified + installed ${d}"
done
