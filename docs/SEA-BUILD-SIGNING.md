# SEA Build and Signing Runbook

Purpose: build and sign the standalone VIP CLI executable (`dist/sea/vip` or `dist/sea/vip.exe`) for each supported platform.

This repo uses `helpers/build-sea.js` and the `npm run build:sea` script. SEA build is pinned to Node 22.

## Shared Prerequisites
- Use Node 22.x exactly for SEA builds.
- Install dependencies before building: `npm ci`.
- Build from repo root.
- The build script embeds:
  - Node runtime
  - bundled CLI code (`src/bin/vip-sea.js`)
  - SEA assets and runtime dependency archive (`sea.node_modules.tgz`)
- Output paths:
  - Unix: `dist/sea/vip`
  - Windows: `dist/sea/vip.exe`

## Shared Build Steps
```bash
npm ci
npm run build
npm run build:sea
```

Quick smoke checks after every build:
```bash
dist/sea/vip --version
dist/sea/vip whoami --help
dist/sea/vip dev-env info --help
```

## macOS (native)
Node/tool setup:
```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 22
node -v
```

Build:
```bash
npm ci
npm run build
npm run build:sea
```

Notes:
- `helpers/build-sea.js` already does ad-hoc signing (`codesign --sign -`) after blob injection so local execution works.
- For distribution, replace ad-hoc signature with a real Developer ID certificate.

Distribution signing:
```bash
codesign --remove-signature dist/sea/vip
codesign --sign "Developer ID Application: <TEAM/ORG>" --force --options runtime dist/sea/vip
codesign --verify --strict --verbose=2 dist/sea/vip
spctl -a -t exec -vv dist/sea/vip
```

## Linux (native)
Node/tool setup:
```bash
node -v
```
(Use Node 22 before build.)

Build:
```bash
npm ci
npm run build
npm run build:sea
chmod +x dist/sea/vip
```

Signing guidance:
- Linux does not have a universal OS-enforced Authenticode-style executable signature.
- Recommended: publish checksums and detached signatures.

Checksum + GPG example:
```bash
sha256sum dist/sea/vip > dist/sea/vip.sha256
gpg --armor --detach-sign dist/sea/vip
```

Cosign blob example:
```bash
cosign sign-blob --yes --output-signature dist/sea/vip.sig dist/sea/vip
cosign verify-blob --signature dist/sea/vip.sig dist/sea/vip
```

## Windows (native)
Use PowerShell or `cmd.exe` on Windows (not WSL) when producing Windows artifacts.

Build:
```powershell
npm ci
npm run build
npm run build:sea
.\dist\sea\vip.exe --version
```

Authenticode signing (SignTool):
```powershell
signtool sign /fd SHA256 /td SHA256 /tr http://timestamp.digicert.com /a .\dist\sea\vip.exe
signtool verify /pa /v .\dist\sea\vip.exe
```

If your cert is in a PFX file:
```powershell
signtool sign /f C:\path\cert.pfx /p <PFX_PASSWORD> /fd SHA256 /td SHA256 /tr http://timestamp.digicert.com .\dist\sea\vip.exe
```

## Windows from WSL
Important: WSL builds Linux binaries by default.

- If target is Linux binary: build/sign inside WSL using the Linux flow.
- If target is Windows `.exe`: run the build and signing commands in Windows context.

From WSL, invoke Windows PowerShell for a Windows-target build:
```bash
WIN_REPO_PATH="$(wslpath -w "$PWD")"
powershell.exe -NoProfile -Command "Set-Location '$WIN_REPO_PATH'; npm ci; npm run build; npm run build:sea"
```

Then sign in Windows context:
```bash
powershell.exe -NoProfile -Command "Set-Location '$WIN_REPO_PATH'; signtool sign /fd SHA256 /td SHA256 /tr http://timestamp.digicert.com /a .\\dist\\sea\\vip.exe; signtool verify /pa /v .\\dist\\sea\\vip.exe"
```

## Release Checklist for Agents
- Confirm Node 22 before SEA build.
- Confirm artifact type matches target OS (`vip` vs `vip.exe`).
- Run smoke checks on the produced executable.
- Apply platform-appropriate signature method.
- Verify signature/checksum before publishing.
- Record signing method and timestamp authority in release notes.

## GitHub Actions Automation
- Workflow: `.github/workflows/sea-build-sign.yml`
- Trigger: manual `workflow_dispatch`
- Jobs: native macOS/Linux/Windows SEA builds plus a Windows WSL SEA build
- Optional signing: set `sign_artifacts=true` and provide signing secrets/vars:
  - macOS: `MACOS_CERTIFICATE_P12_BASE64`, `MACOS_CERTIFICATE_PASSWORD`, `MACOS_SIGNING_IDENTITY`
  - Windows: `WINDOWS_CERTIFICATE_PFX_BASE64`, `WINDOWS_CERTIFICATE_PASSWORD`
  - optional variable: `WINDOWS_TIMESTAMP_URL`
- Output: uploaded SEA binary + SHA256 artifact per job
