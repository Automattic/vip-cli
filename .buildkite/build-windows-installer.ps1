#Requires -Version 5.1
# Consume the signed binaries from this build; installer failures are isolated.
$ErrorActionPreference = 'Stop'
$binBase = if ($env:BIN_BASE) { $env:BIN_BASE } else { 'vip-next' }

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
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $stage | Out-Null
try {
  # Agent v3 stores Windows artifact paths with backslashes; v4 uses slashes.
  # Match either prefix while retaining the exact upstream step and platform.
  buildkite-agent artifact download "*$binBase-windows-amd64.tar.gz*" $stage --step binaries-windows
  if ($LASTEXITCODE -ne 0) { throw 'binary artifact download failed' }
  $payload = Join-Path $stage 'payload'
  go run -mod=mod ./cmd/installer-payload windows "$stage/dist/$binBase-windows-amd64.tar.gz" $payload
  if ($LASTEXITCODE -ne 0) { throw 'binary archive verification failed' }
  $out = Join-Path $payload 'vip-next.exe'
  $helper = Join-Path $payload 'go-search-replace.exe'
  . "$PSScriptRoot/sign-windows.ps1"
  foreach ($binary in @($out, $helper)) {
    & $env:SIGNTOOL_PATH verify /pa /v $binary
    if ($LASTEXITCODE -ne 0) { throw "binary signature verification failed: $binary" }
  }
  New-Item -ItemType Directory -Force -Path dist | Out-Null
  Write-Host "--- :package: MSI"
  $dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
  $dotnetMajor = 0
  if ($dotnet) {
    $dotnetVersion = (& $dotnet.Source --version | Out-String).Trim()
    if ($LASTEXITCODE -eq 0 -and $dotnetVersion -match '^(\d+)\.') {
      $dotnetMajor = [int]$Matches[1]
    }
  }
  if ($dotnetMajor -lt 8) {
    choco install dotnet-8.0-sdk -y --no-progress
    if ($LASTEXITCODE -ne 0) { throw 'choco install dotnet-8.0-sdk failed' }
    $env:PATH = "$env:PATH;$env:ProgramFiles\dotnet"
  }

  $msi = "dist/$binBase-windows-amd64.msi"
  & ./packaging/windows/build-msi.ps1 -Version $version -CLI $out -Helper $helper -Output $msi
  if ($LASTEXITCODE -ne 0) { throw 'build-msi.ps1 failed' }
  Sign-File $msi
  & ./packaging/windows/verify-msi.ps1 -MSI $msi -CLI $out -Helper $helper
  if ($LASTEXITCODE -ne 0) { throw 'verify-msi.ps1 failed' }
  $msiHash = (Get-FileHash -Algorithm SHA256 $msi).Hash.ToLower()
  "$msiHash *$(Split-Path $msi -Leaf)" | Set-Content "$msi.sha256" -NoNewline -Encoding ascii
  # Upload only after the signed MSI and its payload have passed verification.
  buildkite-agent artifact upload "$msi;$msi.sha256"
  if ($LASTEXITCODE -ne 0) { throw 'installer artifact upload failed' }
} finally {
  Remove-Item $stage -Recurse -Force
}
