#Requires -Version 5.1
# Run the real installer script through artifact lookup with agent-v3 Windows
# paths. Stop before package construction; no signing or host installation.
$ErrorActionPreference = 'Stop'
$previousBinBase = $env:BIN_BASE
$env:BIN_BASE = 'vip-next'

function go {
  $global:LASTEXITCODE = 0
  if ($args[0] -eq 'version') { return 'go version test' }
  if ($args -contains './cmd/stamp-version') { return '5.0.0-alpha.1' }
  if ($args -contains './cmd/installer-payload') {
    $archive = $args[$args.Count - 2]
    if (-not (Test-Path -LiteralPath $archive) -or -not (Test-Path -LiteralPath "$archive.sha256")) {
      throw 'Downloaded artifacts were not placed at the expected extraction paths'
    }
    throw 'TEST_STOP_BEFORE_PACKAGING'
  }
  throw "Unexpected Go invocation: $args"
}

function buildkite-agent {
  if ($args[0] -ne 'artifact' -or $args[1] -ne 'download' -or
      $args[4] -ne '--step' -or $args[5] -ne 'binaries-windows') {
    throw "Unexpected or unscoped artifact command: $args"
  }
  $pattern = '^' + [regex]::Escape($args[2]).Replace('\*', '.*') + '$'
  # These are the paths actually recorded by Buildkite build #96.
  $paths = @("dist${artifactSeparator}vip-next-windows-amd64.tar.gz", "dist${artifactSeparator}vip-next-windows-amd64.tar.gz.sha256")
  $matches = @($paths | Where-Object { $_ -cmatch $pattern })
  $global:LASTEXITCODE = 1
  if ($matches.Count -ne 2) { return }
  foreach ($path in $matches) {
    $destination = Join-Path $args[3] $path
    New-Item -ItemType Directory -Force -Path (Split-Path $destination -Parent) | Out-Null
    [System.IO.File]::WriteAllText($destination, 'test artifact')
  }
  $global:LASTEXITCODE = 0
}

try {
  foreach ($artifactSeparator in @('\', '/')) {
    try {
      & "$PSScriptRoot/build-windows-installer.ps1"
      throw 'Installer script did not stop at the test boundary'
    } catch {
      # Only the Go extraction stub emits this after verifying both downloads.
      if ($_.Exception.Message -ne 'TEST_STOP_BEFORE_PACKAGING') { throw }
    }
  }
  Write-Host 'Windows artifact lookup regression passed for both separator styles'
} finally {
  $env:BIN_BASE = $previousBinBase
}
