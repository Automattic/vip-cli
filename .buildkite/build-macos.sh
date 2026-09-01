#!/usr/bin/env bash
set -euo pipefail
# Build, sign, and notarize the macOS vip-next artifacts on a Buildkite macOS
# agent (queue: mac). Two bare per-arch binaries: codesigned + notarized
# (online-verified; a bare Mach-O can't be stapled). Checksums are written
# AFTER signing (signing changes the bytes).

[ -f .buildkite/shared-pipeline-vars ] && . .buildkite/shared-pipeline-vars
: "${BIN_BASE:=vip-next}"

echo "--- :ruby: install gems"
if command -v install_gems >/dev/null 2>&1; then install_gems; else bundle install; fi

echo "--- :go: toolchain"
# Any Go will do: go.mod's `toolchain` directive makes it fetch go1.27.0 itself.
if ! command -v go >/dev/null 2>&1; then
  echo "--- :package: install go"
  brew install go
fi
go version

# Bundler installs to `vendor/bundle`, which makes Go take `-mod=vendor`.
export GOFLAGS="${GOFLAGS:--mod=mod}"

VERSION="$(go run -mod=mod ./cmd/stamp-version)"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

build() {
  local goarch="$1"
  local out="dist/${BIN_BASE}-darwin-${goarch}"
  echo "--- :go: build darwin/${goarch}"
  CGO_ENABLED=0 GOOS=darwin GOARCH="${goarch}" \
    go build -buildvcs=false -trimpath \
    -ldflags="-s -w -X github.com/Automattic/vip/internal/version.Version=${VERSION} -X github.com/Automattic/vip/internal/version.Commit=${COMMIT}" \
    -o "${out}" ./cmd/vip-next
}

checksum() { shasum -a 256 "$1" > "$1.sha256"; }

mkdir -p dist
build arm64
build amd64

# Smoke-test the native arch (a cross-built slice may not run without Rosetta).
case "$(uname -m)" in
  arm64) native=arm64 ;;
  x86_64) native=amd64 ;;
  *) native="" ;;
esac
if [ -n "${native}" ]; then
  echo "--- :test_tube: smoke darwin/${native}"
  "dist/${BIN_BASE}-darwin-${native}" --version
  "dist/${BIN_BASE}-darwin-${native}" whoami --help
fi

echo "--- :closed_lock_with_key: fetch signing certs (fastlane match)"
bundle exec fastlane configure_code_signing

for arch in arm64 amd64; do
  bin="dist/${BIN_BASE}-darwin-${arch}"
  echo "--- :closed_lock_with_key: sign and notarize ${arch}"
  bundle exec fastlane sign_and_notarize binary:"${bin}"
  checksum "${bin}"
done
