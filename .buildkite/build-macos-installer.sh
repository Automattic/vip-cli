#!/usr/bin/env bash
set -euo pipefail
# Package the already signed/notarized binaries from this build.
[ -f .buildkite/shared-pipeline-vars ] && . .buildkite/shared-pipeline-vars
: "${BIN_BASE:=vip-next}"

if command -v install_gems >/dev/null 2>&1; then install_gems; else bundle install; fi
if ! command -v go >/dev/null 2>&1; then brew install go; fi
export GOFLAGS="${GOFLAGS:--mod=mod}"
VERSION="$(go run -mod=mod ./cmd/stamp-version)"
numeric_version="$(go run -mod=mod ./cmd/installer-version "$VERSION")"

# This lane does not run in the binary job and never creates certificates.
bundle exec fastlane configure_installer_signing
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
buildkite-agent artifact download "dist/${BIN_BASE}-darwin-*.tar.gz*" "$stage" --step binaries-macos
mkdir -p dist
for arch in arm64 amd64; do
  payload="$stage/$arch"
  go run -mod=mod ./cmd/installer-payload darwin "$stage/dist/${BIN_BASE}-darwin-${arch}.tar.gz" "$payload"
  bin="$payload/vip-next"
  helper="$payload/go-search-replace"
  bundle exec fastlane verify_code_signing binary:"$bin"
  bundle exec fastlane verify_code_signing binary:"$helper"
  pkg="dist/${BIN_BASE}-darwin-${arch}.pkg"
  bash packaging/macos/build-pkg.sh "$VERSION" "$arch" "$bin" "$helper" "$pkg"
  bundle exec fastlane sign_and_notarize_installer package:"$pkg"
  python3 packaging/macos/verify-pkg.py "$pkg" "$numeric_version" "$arch" "$bin" "$helper"
  shasum -a 256 "$pkg" > "$pkg.sha256"
done
# No automatic artifact_paths: failed/unsigned/partially verified packages must
# never be uploaded by Buildkite's post-command hook.
buildkite-agent artifact upload "dist/${BIN_BASE}-darwin-*.pkg;dist/${BIN_BASE}-darwin-*.pkg.sha256"
