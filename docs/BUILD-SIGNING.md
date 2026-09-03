# Build and Signing Runbook

Purpose: build and sign the standalone `vip-next` executable for each supported
platform.

The binary is a statically linked Go program (`CGO_ENABLED=0`), so **one host can
cross-compile every target**. Only _signing_ is platform-specific: Authenticode
(`signtool`) runs on Windows, `codesign` runs on macOS, and Linux has no
OS-enforced executable signature (publish checksums/detached signatures
instead).

> This replaces the old Node Single-Executable-Application (SEA) flow. There is
> no `npm run build:sea`, no Node runtime to embed, and no WSL-mediated Windows
> build — Go cross-compiles the `.exe` directly.

## Prerequisites

- Go 1.27+ (the tree uses the standard-library `encoding/json/v2` package).
- Build from the repo root.

## Build

Native build for the host platform:

```bash
make build          # -> bin/vip-next  (bin/vip-next.exe on Windows)
```

`make build` is the canonical path. Under the hood it runs, with the version
metadata stamped into `internal/version`:

```bash
CGO_ENABLED=0 go build -buildvcs=false -trimpath \
  -ldflags="-s -w \
    -X github.com/Automattic/vip/internal/version.Version=$(git describe --tags --always --dirty) \
    -X github.com/Automattic/vip/internal/version.Commit=$(git rev-parse --short HEAD)" \
  -o bin/vip-next ./cmd/vip-next
```

To cross-compile any target from any host, set `GOOS`/`GOARCH` and give the
output the right extension:

```bash
# Windows amd64 (produces a PE the same as a native Windows build)
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 \
  go build -trimpath -ldflags="-s -w" -o dist/vip-next-windows-amd64.exe ./cmd/vip-next

# macOS arm64
GOOS=darwin GOARCH=arm64 ... -o dist/vip-next-darwin-arm64 ./cmd/vip-next

# Linux amd64
GOOS=linux GOARCH=amd64 ... -o dist/vip-next-linux-amd64 ./cmd/vip-next
```

**Sign after building.** The signature covers the file's bytes (Authenticode
embeds it in the PE certificate table; `codesign` in the Mach-O load commands),
so any rebuild invalidates it. `-s -w -trimpath` are fine — they do not affect
signing.

Quick smoke checks (only on a host that can execute the target — a
cross-compiled binary won't run on the build machine):

```bash
bin/vip-next --version
bin/vip-next whoami --help
```

## macOS

Distribution signing with a Developer ID certificate:

```bash
codesign --remove-signature bin/vip-next
codesign --sign "Developer ID Application: <TEAM/ORG>" --force --options runtime --timestamp bin/vip-next
codesign --verify --strict --verbose=2 bin/vip-next
spctl -a -t exec -vv bin/vip-next    # Gatekeeper assessment
```

### Notarize

Signing alone is not enough for public distribution — since macOS 10.15,
Gatekeeper also requires the binary to be **notarized** (scanned and approved by
Apple). Sign first (with `--options runtime`, as above), then submit.

`notarytool` accepts a `.zip`, `.pkg`, or `.dmg` — not a bare Mach-O — so zip the
signed binary with `ditto` (which preserves the signature), then submit and wait:

```bash
ditto -c -k --keepParent bin/vip-next bin/vip-next.zip
xcrun notarytool submit bin/vip-next.zip --wait --timeout 30m \
  --key AuthKey_XXXXXXXXXX.p8 --key-id <KEY_ID> --issuer <ISSUER_UUID>
```

`--wait` blocks until Apple finishes and exits non-zero unless the result is
`Accepted`; on rejection, read the details with
`xcrun notarytool log <submission-id> --key … --key-id … --issuer …`.

Authentication is either an **App Store Connect API key** (recommended, shown
above — create it under App Store Connect → Users and Access → Integrations) or
an **Apple ID**:

```bash
xcrun notarytool submit bin/vip-next.zip --wait \
  --apple-id you@example.com --team-id <TEAMID> --password <app-specific-password>
```

**Stapling:** a standalone binary **cannot be stapled** — `xcrun stapler staple`
only works on containers (`.app`, `.pkg`, `.dmg`) that have somewhere to store
the ticket. For a bare CLI binary, Gatekeeper verifies the notarization online at
first run instead. If you later distribute inside a `.pkg`/`.dmg`, staple that
container so it also validates offline.

## Linux (and WSL)

Linux — including the binary you run inside WSL — has no universal OS-enforced
Authenticode-style signature. **Do not run `signtool` against the Linux ELF**;
it isn't a PE and there is nothing for Authenticode to sign.

- The WSL user runs the **Linux** artifact (`vip-next`, no extension), the same
  as any native Linux user. Nothing extra is required for WSL.
- A Windows-signed `.exe` will not run as a native Linux binary and vice versa —
  they are two separate artifacts.

Recommended integrity instead: publish a checksum and a detached signature.

```bash
# SHA-256 checksum
sha256sum bin/vip-next > bin/vip-next.sha256

# Detached GPG signature
gpg --armor --detach-sign bin/vip-next

# …or Sigstore/cosign (keyless)
cosign sign-blob --yes --output-signature bin/vip-next.sig bin/vip-next
cosign verify-blob --signature bin/vip-next.sig bin/vip-next
```

## Windows

Produce the `.exe` (native `make build`, or cross-compile from anywhere with
`GOOS=windows`), then sign in a **Windows** shell — `signtool`/Authenticode are
Windows-only. You can cross-compile the binary from WSL, but run the signing
commands from Windows PowerShell (or via `signtool.exe` over WSL interop if the
SDK is on the Windows PATH).

`signtool` ships with the **Windows SDK "Signing Tools"** component (install via
`winget install Microsoft.WindowsSDK`, or the standalone SDK). It lands under
`C:\Program Files (x86)\Windows Kits\10\bin\<version>\x64\signtool.exe`.

Authenticode signing (certificate auto-selected from the Windows cert store):

```powershell
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /a bin\vip-next.exe
signtool verify /pa /v bin\vip-next.exe
```

With a PFX file:

```powershell
signtool sign /f C:\path\cert.pfx /p <PFX_PASSWORD> /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 bin\vip-next.exe
```

Always timestamp (`/tr` + `/td SHA256`) so signatures stay valid after the
certificate expires.

### No-SDK alternative

`Set-AuthenticodeSignature` is built into PowerShell and needs no SDK install —
useful for local testing (see below) or on machines without `signtool`:

```powershell
Set-AuthenticodeSignature -FilePath bin\vip-next.exe -Certificate $cert `
  -HashAlgorithm SHA256 -TimestampServer http://timestamp.digicert.com
Get-AuthenticodeSignature bin\vip-next.exe | Format-List Status, StatusMessage
```

### Certificate reality check

- A **public-CA code-signing certificate** (DigiCert, Sectigo, SSL.com,
  GlobalSign, …) is required for users to avoid SmartScreen "unknown publisher"
  warnings. A self-signed cert only silences warnings on machines that already
  trust it — use it for testing the mechanics, not for release.
- **OV** certs build SmartScreen reputation over downloads/time. **EV** certs get
  immediate SmartScreen trust, but since June 2023 the private key must live on
  FIPS hardware — a USB token or a cloud signing service (Azure Trusted Signing,
  DigiCert KeyLocker, SSL.com eSigner). A plain `.pfx` on disk no longer works
  for EV; sign through the provider's KSP (`signtool sign /dlib …` for Azure
  Trusted Signing, or `/csp /kc` for a token).
- Since this is an Automattic artifact, check for an existing org signing
  certificate / Azure Trusted Signing tenant before buying one. That is what the
  `WINDOWS_CERTIFICATE_PFX_BASE64` CI secret is wired for.

## Local signed-build test (self-signed, Windows)

This proves the build-and-sign flow end to end without a CA certificate. The
signature is genuine Authenticode; only the certificate is self-signed, so it is
trusted solely on this machine. Run in Windows PowerShell from the repo root:

```powershell
# 1. Build the exe (cross-compiles fine from WSL too)
$env:GOOS='windows'; $env:GOARCH='amd64'; $env:CGO_ENABLED='0'
go build -trimpath -ldflags='-s -w' -o bin\vip-next.exe .\cmd\vip-next

# 2. Create a throwaway code-signing certificate (CurrentUser, no admin needed)
$cert = New-SelfSignedCertificate -Type CodeSigningCert `
  -Subject 'CN=VIP CLI Test Signing' -CertStoreLocation Cert:\CurrentUser\My -HashAlgorithm SHA256

# 3. Trust it for the current user so verification returns Valid
$cerPath = Join-Path $env:TEMP 'vip-cli-test-cert.cer'
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null
Import-Certificate -FilePath $cerPath -CertStoreLocation Cert:\CurrentUser\Root | Out-Null

# 4. Sign + verify
Set-AuthenticodeSignature -FilePath bin\vip-next.exe -Certificate $cert `
  -HashAlgorithm SHA256 -TimestampServer http://timestamp.digicert.com
Get-AuthenticodeSignature bin\vip-next.exe | Format-List Status, StatusMessage, SignerCertificate

# 5. Clean up the throwaway trust anchor (leave no test cert trusted)
Remove-Item "Cert:\CurrentUser\Root\$($cert.Thumbprint)" -Force
Remove-Item "Cert:\CurrentUser\My\$($cert.Thumbprint)" -Force
```

A `Status` of `Valid` at step 4 confirms the pipeline works. After cleanup the
exe remains signed by the (now-untrusted) test cert — discard it and sign the
real release with a CA certificate.

## CI automation

Release builds run on **Buildkite** (Automattic's signing stack), not GitHub
Actions. See `.buildkite/pipeline.yml` and the per-platform scripts.

- **Pipeline:** `.buildkite/pipeline.yml` — three independent steps (macOS,
  Windows, Linux), each building on its own native agent.
  Setup sources `.buildkite/shared-pipeline-vars` before pipeline upload
  (CI toolkit plugin pin, `BIN_BASE`, `IMAGE_ID`).
- **Build scripts:** `.buildkite/build-macos.sh`, `.buildkite/build-windows.ps1`,
  `.buildkite/build-linux.sh`.
- **Trigger / gating:** every commit builds and smoke-tests all three
  platforms. macOS signs and notarizes, and Windows Authenticode-signs, on
  every build.
- **macOS certs:** fastlane `match` (`fastlane/Fastfile` →
  `configure_code_signing`), `type: developer_id`, stored in S3
  (`a8c-fastlane-match`). Signing and notarization are the
  `sign_and_notarize` lane: Developer ID Application, identifier
  `com.automattic.vip-cli`, no staple on a bare Mach-O.
- **macOS artifacts:** per-arch `.tar.gz` of `vip-next` + `go-search-replace`,
  both signed and notarized (online-verified).
- **Windows / Linux artifacts:** the same tarball layout. Windows Authenticode-
  signs both PEs via Azure Trusted Signing; Linux checksums only.

### Verifying a real run

On a Buildkite build, confirm:

- `notarytool` result **Accepted** for every submission.
- macOS binaries: `codesign --verify --strict --verbose=2` passes and
  `codesign --display` shows `Identifier=com.automattic.vip-cli`.
- Windows: `signtool verify /pa /v <exe>` passes.
- Every artifact has a matching `.sha256`.

## Release checklist

- Confirm the artifact type matches the target OS (`vip-next` vs `vip-next.exe`).
- Run smoke checks on a host that can execute the produced binary.
- Apply the platform-appropriate signature; **verify** it before publishing.
- Publish checksums (and detached signatures for Linux/macOS).
- Record the signing method and timestamp authority in the release notes.

---

## Bundling `go-search-replace`

`vip-next` shells out to the `go-search-replace` binary; it never reimplements
it. `searchreplace.ResolveBinary` looks in this order:

1. `$VIP_SEARCH_REPLACE_BIN`
2. `<executable-dir>/bin/go-search-replace[.exe]`
3. `<executable-dir>/go-search-replace[.exe]` (sibling)
4. `PATH`

**Decision: we bundle it.** The CLI advertises itself as a self-contained static
binary and `dev-env` depends on working offline, so fetching at install time was
rejected. Cost is ~2.4 MB per platform in the release tarball.

### How it is vendored

`third_party/go-search-replace/MANIFEST` pins an upstream release tag and a
sha256 per platform. **Those digests are not ours** — they are the subject
digests from the release's SLSA provenance attestation
(`go-search-replace.intoto.jsonl`), produced by
`Automattic/go-search-replace/.github/workflows/release.yml@refs/tags/<tag>`.

```bash
make vendor-search-replace          # this host's platform
ALL=1 make vendor-search-replace    # every platform — the release path
make vendor-search-replace TAG=0.0.12   # upgrade; rewrites MANIFEST
```

It downloads, gunzips, verifies against MANIFEST, and **refuses to install on
mismatch** (verified: a corrupted digest exits non-zero and installs nothing).
Binaries are gitignored; only `MANIFEST` is tracked, so an upgrade is one
reviewable commit whose diff is a tag and eight hashes.

> **Trap:** upstream ships each asset **gzipped** (`<name>.gz`) but the
> provenance attests the **uncompressed** binary. Verify by gunzipping first,
> then hashing. Confirmed against 0.0.11.

`make build` then resolves in this order, and **fails** if none apply
(escape hatches: `VIP_SEARCH_REPLACE_BIN`, `ALLOW_MISSING_SEARCH_REPLACE=1`):

1. `third_party/go-search-replace/<goos>-<goarch>/` — all 8 platforms
2. `__fixtures__/search-replace-binaries/` — legacy, 4 platforms only, and part
   of the vendored Node mirror, so **nothing may be added there**
3. failure

Upstream 0.0.11 publishes `darwin_{amd64,arm64}`, `linux_{386,amd64,arm64}`,
`windows_{386,amd64,arm64}` — so `linux/arm64` (Graviton, ARM CI, Docker on
Apple Silicon), previously unsupported, is covered with no self-building.

CI fetches the helper with `.buildkite/fetch-search-replace.sh` (curl of the
public GitHub release, then the MANIFEST sha256). Each arch is packed as
`vip-next` + `go-search-replace` in a `.tar.gz` after signing.

Re-signing the upstream helper with our Developer ID is expected. The MANIFEST
checksum plus upstream SLSA provenance is what makes that defensible — do not
weaken either.

### Open

- Whether to mirror the upstream releases internally rather than depending on
  GitHub availability at build time.
- `slsa-verifier` is not yet wired in. The MANIFEST digests were taken from the
  provenance by hand for 0.0.11; verifying the attestation signature in CI on
  every upgrade would close the loop properly.
