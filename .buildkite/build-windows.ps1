#Requires -Version 5.1
# Build and Authenticode-sign vip-next.exe on a Buildkite Windows agent.
# Checksum is computed AFTER signing (signing changes the bytes).
$ErrorActionPreference = 'Stop'

$binBase = if ($env:BIN_BASE) { $env:BIN_BASE } else { 'vip-next' }

function Get-GitOr($cmd, $fallback) {
  try { $v = & git @cmd 2>$null; if ($LASTEXITCODE -eq 0 -and $v) { return $v.Trim() } } catch {}
  return $fallback
}

New-Item -ItemType Directory -Force -Path dist | Out-Null
$out = "dist/$binBase-windows-amd64.exe"

# Any Go will do: go.mod's `toolchain` directive makes it fetch go1.27.0 itself.
if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
  Write-Host "--- :package: install go"
  choco install golang -y --no-progress
  if ($LASTEXITCODE -ne 0) { throw 'choco install golang failed' }
  # choco updates the machine PATH, not this process's.
  $env:PATH = "$env:PATH;$env:ProgramFiles\Go\bin"
}
go version
if ($LASTEXITCODE -ne 0) { throw 'go not usable after install' }

$version = (& go run -mod=mod ./cmd/stamp-version | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or -not $version) { throw 'stamp-version failed' }
$commit = Get-GitOr @('rev-parse','--short','HEAD') 'unknown'

Write-Host "--- :go: build windows/amd64"
$env:CGO_ENABLED = '0'; $env:GOOS = 'windows'; $env:GOARCH = 'amd64'
$ldflags = "-s -w -X github.com/Automattic/vip/internal/version.Version=$version -X github.com/Automattic/vip/internal/version.Commit=$commit"
go build -buildvcs=false -trimpath -ldflags="$ldflags" -o $out ./cmd/vip-next
if ($LASTEXITCODE -ne 0) { throw 'go build failed' }

Write-Host "--- :test_tube: smoke"
& $out --version
& $out whoami --help

Write-Host "--- :closed_lock_with_key: Azure Trusted Signing"
$setupScript = (Get-Command setup_azure_trusted_signing.ps1 -ErrorAction Stop).Source
& $setupScript
if ($LASTEXITCODE -ne 0) { throw 'setup_azure_trusted_signing.ps1 failed' }

Write-Host "--- :closed_lock_with_key: Authenticode sign"
& $env:SIGNTOOL_PATH sign /v `
  /fd $env:AZURE_FILE_DIGEST `
  /tr $env:AZURE_TIMESTAMP_SERVER `
  /td $env:AZURE_TIMESTAMP_DIGEST `
  /dlib $env:AZURE_CODE_SIGNING_DLIB `
  /dmdf $env:AZURE_METADATA_JSON `
  $out
if ($LASTEXITCODE -ne 0) { throw 'signtool sign failed' }
& $env:SIGNTOOL_PATH verify /pa /v $out
if ($LASTEXITCODE -ne 0) { throw 'signtool verify failed' }

Write-Host "--- checksum"
$hash = (Get-FileHash -Algorithm SHA256 $out).Hash.ToLower()
"$hash *$(Split-Path $out -Leaf)" | Set-Content "$out.sha256" -NoNewline
