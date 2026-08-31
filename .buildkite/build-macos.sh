#!/usr/bin/env bash
set -euo pipefail
# Build, and on tag builds sign + notarize, the macOS vip-next artifacts, on a
# Buildkite macOS agent (queue: mac):
#   - two bare per-arch binaries: codesigned + notarized (online-verified; a bare
#     Mach-O can't be stapled)
#   - one universal .pkg installer: codesigned + productsigned + notarized + STAPLED
#     (offline-verified)
# Checksums are written AFTER signing (signing changes the bytes).

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

VERSION="$(git describe --tags --always --dirty 2>/dev/null || echo dev)"
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

if [ -z "${BUILDKITE_TAG:-}" ]; then
  echo "--- not a tag build; skipping sign/notarize (unsigned checksums only)"
  checksum "dist/${BIN_BASE}-darwin-arm64"
  checksum "dist/${BIN_BASE}-darwin-amd64"
  exit 0
fi

echo "--- :closed_lock_with_key: fetch signing certs (fastlane match)"
bundle exec fastlane configure_code_signing

# Build the universal binary from the UNSIGNED arches, then sign all three once.
uni="dist/${BIN_BASE}-darwin-universal"
lipo -create -output "${uni}" "dist/${BIN_BASE}-darwin-arm64" "dist/${BIN_BASE}-darwin-amd64"

for bin in "dist/${BIN_BASE}-darwin-arm64" "dist/${BIN_BASE}-darwin-amd64" "${uni}"; do
  echo "--- :closed_lock_with_key: codesign ${bin}"
  codesign --remove-signature "${bin}" 2>/dev/null || true # drop Go's ad-hoc sig
  codesign --sign "${MACOS_SIGN_IDENTITY}" --options runtime --timestamp --force "${bin}"
  codesign --verify --strict --verbose=2 "${bin}"
done

# Bare binaries: notarize (no staple — nothing to hold the ticket), then checksum.
for arch in arm64 amd64; do
  bin="dist/${BIN_BASE}-darwin-${arch}"
  echo "--- :cloud: notarize ${arch} (no staple)"
  ditto -c -k --keepParent "${bin}" "${bin}.zip"
  bundle exec fastlane notarize_artifact path:"${bin}.zip"
  rm -f "${bin}.zip"
  checksum "${bin}"
done

# Universal .pkg: package the signed universal binary → sign the pkg → notarize + staple.
echo "--- :package: build + sign universal .pkg"
pkgroot="$(mktemp -d)"
cp "${uni}" "${pkgroot}/${BIN_BASE}"
pkg="dist/${BIN_BASE}-darwin-universal.pkg"
pkgbuild --root "${pkgroot}" --identifier com.automattic.vip-cli --version "${VERSION}" \
  --install-location /usr/local/bin "${pkg}.unsigned"
productsign --sign "${MACOS_INSTALLER_IDENTITY}" "${pkg}.unsigned" "${pkg}"
rm -f "${pkg}.unsigned"
rm -rf "${pkgroot}"

echo "--- :cloud: notarize + staple .pkg"
bundle exec fastlane notarize_artifact path:"${pkg}" skip_stapling:false
xcrun stapler validate "${pkg}"
checksum "${uni}"
checksum "${pkg}"
