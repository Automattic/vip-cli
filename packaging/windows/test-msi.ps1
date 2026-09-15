#Requires -Version 5.1
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
  throw 'The MSI lifecycle test must run on a disposable Windows CI runner.'
}
if ($env:VIP_INSTALLER_E2E -ne '1' -or
    $env:GITHUB_ACTIONS -notmatch '^(?i:true)$' -or
    $env:RUNNER_ENVIRONMENT -notmatch '^(?i:github-hosted)$') {
  throw 'Refusing to modify the host. This test requires VIP_INSTALLER_E2E=1 on a GitHub-hosted Actions runner.'
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'The MSI lifecycle test requires an elevated disposable Windows CI runner.'
}

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$buildScript = Join-Path $PSScriptRoot 'build-msi.ps1'
$verifyScript = Join-Path $PSScriptRoot 'verify-msi.ps1'
$installDir = Join-Path $env:ProgramFiles 'Automattic\VIP CLI'
$markerPath = Join-Path $installDir '.vip-next-installer.json'
$pathTarget = $installDir.TrimEnd('\')
$initialMachinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("vip-cli-msi-e2e-{0}" -f [Guid]::NewGuid().ToString('N'))
$logsDir = Join-Path $tempRoot 'logs'
$testInstalledProduct = $false

function Test-PathContainsTarget([AllowNull()][string]$PathValue) {
  if ($null -eq $PathValue) { return $false }
  foreach ($entry in $PathValue.Split(';', [StringSplitOptions]::RemoveEmptyEntries)) {
    if ([StringComparer]::OrdinalIgnoreCase.Equals($entry.Trim().TrimEnd('\'), $pathTarget)) {
      return $true
    }
  }
  return $false
}

function Get-VipCliUninstallEntries {
  $roots = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  return @(Get-ItemProperty -Path $roots -ErrorAction SilentlyContinue | Where-Object {
    $displayName = $_.PSObject.Properties['DisplayName']
    $installLocation = $_.PSObject.Properties['InstallLocation']
    ($displayName -and $displayName.Value -eq 'VIP CLI') -or
    ($installLocation -and $installLocation.Value -and
      [StringComparer]::OrdinalIgnoreCase.Equals($installLocation.Value.TrimEnd('\'), $pathTarget))
  })
}

function Invoke-MsiExec {
  param(
    [Parameter(Mandatory = $true)][ValidateSet('install', 'uninstall')][string]$Action,
    [Parameter(Mandatory = $true)][string]$Target,
    [Parameter(Mandatory = $true)][string]$Log,
    [int[]]$ExpectedExitCodes = @(0)
  )

  $verb = if ($Action -eq 'install') { '/i' } else { '/x' }
  $arguments = @($verb, "`"$Target`"", '/qn', '/norestart', '/l*v', "`"$Log`"")
  $process = Start-Process -FilePath "$env:SystemRoot\System32\msiexec.exe" `
    -ArgumentList $arguments `
    -Wait -PassThru
  if ($ExpectedExitCodes -notcontains $process.ExitCode) {
    if (Test-Path -LiteralPath $Log) { Get-Content -LiteralPath $Log | Write-Host }
    throw "msiexec $Action exited $($process.ExitCode); expected $($ExpectedExitCodes -join ', '). Log: $Log"
  }
  return $process.ExitCode
}

function New-FixtureExecutable {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$Output
  )

  Push-Location $repoRoot
  try {
    $env:CGO_ENABLED = '0'
    $env:GOOS = 'windows'
    $env:GOARCH = 'amd64'
    & go build -buildvcs=false -trimpath `
      -ldflags "-s -w -X main.fixtureVersion=$Version" `
      -o $Output ./testdata/installer-fixture
    if ($LASTEXITCODE -ne 0) { throw "go build failed for $Name $Version" }
  } finally {
    Pop-Location
  }
}

function Assert-InstalledPayload {
  param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$ExpectedCli,
    [Parameter(Mandatory = $true)][string]$ExpectedHelper
  )

  $installedCli = Join-Path $installDir 'vip-next.exe'
  $installedHelper = Join-Path $installDir 'go-search-replace.exe'
  foreach ($pair in @(@($installedCli, $ExpectedCli), @($installedHelper, $ExpectedHelper))) {
    if (-not (Test-Path -LiteralPath $pair[0] -PathType Leaf)) { throw "Missing installed file: $($pair[0])" }
    $actualHash = (Get-FileHash -LiteralPath $pair[0] -Algorithm SHA256).Hash
    $expectedHash = (Get-FileHash -LiteralPath $pair[1] -Algorithm SHA256).Hash
    if ($actualHash -ne $expectedHash) { throw "Installed bytes differ for $($pair[0])" }
  }

  $cliVersion = (& $installedCli --version | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $cliVersion -ne $Version) {
    throw "Unexpected vip-next version output: $cliVersion"
  }
  $helperVersion = (& $installedHelper --version | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $helperVersion -ne "${Version}-helper") {
    throw "Unexpected go-search-replace version output: $helperVersion"
  }

  if ((Get-Content -LiteralPath $markerPath -Raw) -ne '{"schema":1,"manager":"msi"}') {
    throw 'Installer marker contents do not match the ownership contract.'
  }
  $installedLicense = Join-Path $installDir 'LICENSE.txt'
  if (-not (Test-Path -LiteralPath $installedLicense -PathType Leaf) -or
      (Get-FileHash -LiteralPath $installedLicense -Algorithm SHA256).Hash -ne
      (Get-FileHash -LiteralPath (Join-Path $repoRoot 'LICENSE') -Algorithm SHA256).Hash) {
    throw 'Installed license does not match the repository license.'
  }
  if (-not (Test-PathContainsTarget ([Environment]::GetEnvironmentVariable('Path', 'Machine')))) {
    throw "The system PATH does not contain $installDir"
  }
  $owner = (& $installedCli --installer-owner | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $owner -notmatch '(?i)\.msi') {
    throw "Installed fixture did not report MSI ownership instructions: $owner"
  }
}

if (Get-VipCliUninstallEntries) { throw 'Refusing to run with an existing VIP CLI MSI installation.' }
if (Test-Path -LiteralPath $installDir) { throw "Refusing to run because $installDir already exists." }
if (Test-Path -LiteralPath $markerPath) { throw "Refusing to run because $markerPath already exists." }
if (Test-PathContainsTarget $initialMachinePath) { throw "Refusing to run because system PATH already contains $installDir." }
if (-not (Get-Command go -ErrorAction SilentlyContinue)) { throw 'Go is required to build the lifecycle fixture executables.' }

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

try {
  $versions = @('5.0.0-alpha.0', '5.0.0-alpha.1')
  $artifacts = @{}
  foreach ($version in $versions) {
    $versionDir = Join-Path $tempRoot ($version -replace '[^A-Za-z0-9.-]', '-')
    New-Item -ItemType Directory -Force -Path $versionDir | Out-Null
    $cli = Join-Path $versionDir 'vip-next.exe'
    $helper = Join-Path $versionDir 'go-search-replace.exe'
    $msi = Join-Path $versionDir 'vip-next-windows-amd64.msi'
    New-FixtureExecutable -Name 'vip-next' -Version $version -Output $cli
    New-FixtureExecutable -Name 'go-search-replace' -Version "${version}-helper" -Output $helper
    & $buildScript -Version $version -CLI $cli -Helper $helper -Output $msi
    if ($LASTEXITCODE -ne 0) { throw "build-msi.ps1 failed for $version" }
    & $verifyScript -MSI $msi -CLI $cli -Helper $helper
    if ($LASTEXITCODE -ne 0) { throw "verify-msi.ps1 failed for $version" }
    $artifacts[$version] = @{ CLI = $cli; Helper = $helper; MSI = $msi }
  }

  $alpha0 = $artifacts['5.0.0-alpha.0']
  $alpha1 = $artifacts['5.0.0-alpha.1']
  Invoke-MsiExec -Action install -Target $alpha0.MSI -Log (Join-Path $logsDir 'install-alpha.0.log')
  $testInstalledProduct = $true
  Assert-InstalledPayload -Version '5.0.0-alpha.0' -ExpectedCli $alpha0.CLI -ExpectedHelper $alpha0.Helper

  Invoke-MsiExec -Action install -Target $alpha1.MSI -Log (Join-Path $logsDir 'upgrade-alpha.1.log')
  Assert-InstalledPayload -Version '5.0.0-alpha.1' -ExpectedCli $alpha1.CLI -ExpectedHelper $alpha1.Helper

  $downgradeExit = Invoke-MsiExec -Action install -Target $alpha0.MSI `
    -Log (Join-Path $logsDir 'downgrade-alpha.0.log') -ExpectedExitCodes @(1603, 1638)
  if ($downgradeExit -eq 0) { throw 'Downgrade unexpectedly succeeded.' }
  Assert-InstalledPayload -Version '5.0.0-alpha.1' -ExpectedCli $alpha1.CLI -ExpectedHelper $alpha1.Helper

  $entry = @(Get-VipCliUninstallEntries)
  if ($entry.Count -ne 1 -or $entry[0].PSChildName -notmatch '^\{[0-9A-Fa-f-]{36}\}$') {
    throw "Expected one uninstall registry entry, found $($entry.Count)."
  }
  Invoke-MsiExec -Action uninstall -Target $entry[0].PSChildName -Log (Join-Path $logsDir 'uninstall.log')
  $testInstalledProduct = $false

  foreach ($path in @(
    (Join-Path $installDir 'vip-next.exe'),
    (Join-Path $installDir 'go-search-replace.exe'),
    (Join-Path $installDir 'LICENSE.txt'),
    $markerPath
  )) {
    if (Test-Path -LiteralPath $path) { throw "Uninstall left managed file behind: $path" }
  }
  $finalMachinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  if ($finalMachinePath -ne $initialMachinePath) {
    throw 'Uninstall did not restore the exact initial system PATH.'
  }
  if (Get-VipCliUninstallEntries) { throw 'Uninstall registry entry remains after uninstall.' }
} catch {
  Get-ChildItem -LiteralPath $logsDir -Filter '*.log' -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "--- MSI log: $($_.FullName)"
    Get-Content -LiteralPath $_.FullName | Write-Host
  }
  throw
} finally {
  if ($testInstalledProduct) {
    $entries = @(Get-VipCliUninstallEntries)
    foreach ($entry in $entries) {
      if ($entry.PSChildName -match '^\{[0-9A-Fa-f-]{36}\}$') {
        try {
          Invoke-MsiExec -Action uninstall -Target $entry.PSChildName `
            -Log (Join-Path $logsDir 'cleanup-uninstall.log') -ExpectedExitCodes @(0, 1605, 3010)
        } catch {
          Write-Warning "Cleanup uninstall failed: $_"
        }
      }
    }
  }
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
