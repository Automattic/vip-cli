#Requires -Version 5.1
# Build vip-next.exe and (on tag builds) Authenticode-sign it, on a Buildkite
# Windows agent. Checksum is computed AFTER signing (signing changes the bytes).
$ErrorActionPreference = 'Stop'

$binBase = if ($env:BIN_BASE) { $env:BIN_BASE } else { 'vip-next' }

function Get-GitOr($cmd, $fallback) {
  try { $v = & git @cmd 2>$null; if ($LASTEXITCODE -eq 0 -and $v) { return $v.Trim() } } catch {}
  return $fallback
}
$version = Get-GitOr @('describe','--tags','--always','--dirty') 'dev'
$commit  = Get-GitOr @('rev-parse','--short','HEAD') 'unknown'

New-Item -ItemType Directory -Force -Path dist | Out-Null
$out = "dist/$binBase-windows-amd64.exe"

Write-Host "--- :go: build windows/amd64"
$env:CGO_ENABLED = '0'; $env:GOOS = 'windows'; $env:GOARCH = 'amd64'
$ldflags = "-s -w -X github.com/Automattic/vip/internal/version.Version=$version -X github.com/Automattic/vip/internal/version.Commit=$commit"
go build -buildvcs=false -trimpath -ldflags="$ldflags" -o $out ./cmd/vip-next
if ($LASTEXITCODE -ne 0) { throw 'go build failed' }

Write-Host "--- :test_tube: smoke"
& $out --version
& $out whoami --help

if ($env:BUILDKITE_TAG) {
  Write-Host "--- :closed_lock_with_key: Authenticode sign"
  # ← infra: confirm the Windows cert mechanism. Draft = PFX-from-base64-secret,
  # mirroring the current GitHub Actions workflow. EV certs can NOT use a plain
  # PFX (FIPS-hardware since June 2023) — if you use Azure Trusted Signing, swap
  # the two signtool lines for `signtool sign /fd SHA256 /tr <url> /td SHA256 /dlib <dll> /dmdf <metadata> $out`.
  $pfxB64 = $env:WINDOWS_CERTIFICATE_PFX_BASE64
  $pfxPw  = $env:WINDOWS_CERTIFICATE_PASSWORD
  $ts     = if ($env:WINDOWS_TIMESTAMP_URL) { $env:WINDOWS_TIMESTAMP_URL } else { 'http://timestamp.digicert.com' }
  if (-not $pfxB64 -or -not $pfxPw) { throw 'tag build but WINDOWS_CERTIFICATE_PFX_BASE64 / _PASSWORD not set' }

  $pfx = Join-Path $env:TEMP 'vip-codesign.pfx'
  [IO.File]::WriteAllBytes($pfx, [Convert]::FromBase64String($pfxB64))
  try {
    signtool sign /fd SHA256 /td SHA256 /tr $ts /f $pfx /p $pfxPw $out
    if ($LASTEXITCODE -ne 0) { throw 'signtool sign failed' }
    signtool verify /pa /v $out
    if ($LASTEXITCODE -ne 0) { throw 'signtool verify failed' }
  } finally {
    Remove-Item $pfx -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "--- checksum"
$hash = (Get-FileHash -Algorithm SHA256 $out).Hash.ToLower()
"$hash *$(Split-Path $out -Leaf)" | Set-Content "$out.sha256" -NoNewline
