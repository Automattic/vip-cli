#!/usr/bin/env bash
set -euo pipefail
# Build the Linux vip-next binaries + checksums on a Buildkite Linux agent.
# Linux has no OS-enforced executable signature; we publish checksums.

[ -f .buildkite/shared-pipeline-vars ] && . .buildkite/shared-pipeline-vars
: "${BIN_BASE:=vip-next}"

if ! command -v go >/dev/null 2>&1; then
  echo "--- :package: install go"
  version="$(awk '/^toolchain / { print $2; exit }' go.mod)"
  version="${version#go}"
  [ -n "${version}" ] || { echo "no toolchain directive in go.mod" >&2; exit 1; }
  case "$(uname -m)" in
    x86_64|amd64) arch=amd64 ;;
    aarch64|arm64) arch=arm64 ;;
    *) echo "unsupported arch $(uname -m)" >&2; exit 1 ;;
  esac
  # Not `$HOME/go` — that is GOPATH.
  prefix="${HOME}/.local"
  mkdir -p "${prefix}"
  curl -fsSL "https://go.dev/dl/go${version}.linux-${arch}.tar.gz" | tar -C "${prefix}" -xz
  export PATH="${prefix}/go/bin:${PATH}"
fi
go version

echo "--- :package: fetch go-search-replace"
.buildkite/fetch-search-replace.sh linux/amd64 linux/arm64

VERSION="$(go run -mod=mod ./cmd/stamp-version)"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

build() {
  local goarch="$1"
  local out="dist/${BIN_BASE}-linux-${goarch}"
  echo "--- :go: build linux/${goarch}"
  CGO_ENABLED=0 GOOS=linux GOARCH="${goarch}" \
    go build -buildvcs=false -trimpath \
    -ldflags="-s -w -X github.com/Automattic/vip/internal/version.Version=${VERSION} -X github.com/Automattic/vip/internal/version.Commit=${COMMIT}" \
    -o "${out}" ./cmd/vip-next
}

checksum() { shasum -a 256 "$1" > "$1.sha256"; }

mkdir -p dist
build amd64
build arm64

case "$(uname -m)" in
  x86_64|amd64) native=amd64 ;;
  aarch64|arm64) native=arm64 ;;
  *) native="" ;;
esac
if [ -n "${native}" ]; then
  echo "--- :test_tube: smoke linux/${native}"
  "dist/${BIN_BASE}-linux-${native}" --version
  "dist/${BIN_BASE}-linux-${native}" whoami --help
fi

for arch in amd64 arm64; do
  bin="dist/${BIN_BASE}-linux-${arch}"
  helper="third_party/go-search-replace/linux-${arch}/go-search-replace"
  echo "--- :package: tarball linux/${arch}"
  .buildkite/pack-release.sh linux "${arch}" "${bin}" "${helper}"
  checksum "dist/${BIN_BASE}-linux-${arch}.tar.gz"
  rm -f "${bin}"
done



