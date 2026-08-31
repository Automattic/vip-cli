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

VERSION="$(git describe --tags --always --dirty 2>/dev/null || echo dev)"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

build() {
  local goarch="$1"
  local out="dist/${BIN_BASE}-linux-${goarch}"
  echo "--- :go: build linux/${goarch}"
  CGO_ENABLED=0 GOOS=linux GOARCH="${goarch}" \
    go build -buildvcs=false -trimpath \
    -ldflags="-s -w -X github.com/Automattic/vip/internal/version.Version=${VERSION} -X github.com/Automattic/vip/internal/version.Commit=${COMMIT}" \
    -o "${out}" ./cmd/vip-next
  shasum -a 256 "${out}" > "${out}.sha256"
}

mkdir -p dist
build amd64
build arm64

# Smoke-test only the arch matching this agent (a cross-built slice won't run here).
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


