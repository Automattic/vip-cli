#Requires -Version 5.1
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$Version,
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$CLI,
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$Helper,
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$Output
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$wixVersion = '5.0.2'
$uiExtension = "WixToolset.UI.wixext/$wixVersion"
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$wixSource = Join-Path $PSScriptRoot 'vip-next.wxs'
$licenseSource = Join-Path $repoRoot 'LICENSE'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("vip-cli-msi-build-{0}" -f [Guid]::NewGuid().ToString('N'))
$stageDir = Join-Path $tempRoot 'stage'
$toolDir = Join-Path $tempRoot 'tools'
$originalDotnetRollForward = [Environment]::GetEnvironmentVariable('DOTNET_ROLL_FORWARD', 'Process')

function Resolve-InputFile([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Label does not exist or is not a file: $Path"
  }
  return (Resolve-Path -LiteralPath $Path).ProviderPath
}

function Invoke-External([string]$Command, [string[]]$Arguments, [string]$Failure) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Failure (exit $LASTEXITCODE)" }
}

function Convert-LicenseToRtf([string]$Source, [string]$Destination) {
  $body = [IO.File]::ReadAllText($Source)
  $body = $body.Replace('\', '\\').Replace('{', '\{').Replace('}', '\}')
  $body = $body.Replace("`r`n", "`n").Replace("`r", "`n").Replace("`n", "\par`r`n")
  $rtf = '{\rtf1\ansi\deff0{\fonttbl{\f0\fnil\fcharset0 Segoe UI;}}\viewkind4\uc1\pard\f0\fs18 ' + $body + '}'
  [IO.File]::WriteAllText($Destination, $rtf, (New-Object Text.ASCIIEncoding))
}

function Get-ProductCode([string]$NumericVersion) {
  $seed = "vip-cli-msi:{9D089A27-73D9-4A31-91E1-A21A37ED94F1}:$NumericVersion"
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    $hash = $sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($seed))
  } finally {
    $sha256.Dispose()
  }
  $hash[6] = ($hash[6] -band 0x0f) -bor 0x50
  $hash[8] = ($hash[8] -band 0x3f) -bor 0x80
  $hex = ([BitConverter]::ToString($hash, 0, 16)).Replace('-', '')
  return '{' + $hex.Substring(0, 8) + '-' + $hex.Substring(8, 4) + '-' +
    $hex.Substring(12, 4) + '-' + $hex.Substring(16, 4) + '-' + $hex.Substring(20, 12) + '}'
}

$cliPath = Resolve-InputFile $CLI 'CLI executable'
$helperPath = Resolve-InputFile $Helper 'Helper executable'
$licensePath = Resolve-InputFile $licenseSource 'Repository license'
$wixSourcePath = Resolve-InputFile $wixSource 'WiX source'

$outputFullPath = [IO.Path]::GetFullPath($Output)
$outputDirectory = Split-Path -Parent $outputFullPath
if (-not $outputDirectory) { $outputDirectory = (Get-Location).ProviderPath }
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$outputDirectory = (Resolve-Path -LiteralPath $outputDirectory).ProviderPath
$outputFullPath = Join-Path $outputDirectory (Split-Path -Leaf $outputFullPath)

$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if (-not $dotnet) {
  throw 'Building the MSI requires the .NET 8 SDK or newer. Install it and rerun packaging/windows/build-msi.ps1.'
}
$dotnetVersion = (& $dotnet.Source --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $dotnetVersion -notmatch '^(\d+)\.') {
  throw 'Unable to determine the installed .NET SDK version.'
}
if ([int]$Matches[1] -lt 8) {
  throw "Building the MSI requires the .NET 8 SDK or newer; found $dotnetVersion."
}

$go = Get-Command go -ErrorAction SilentlyContinue
if (-not $go) { throw 'Building the MSI requires Go to resolve the shared numeric installer version.' }

New-Item -ItemType Directory -Force -Path $stageDir, $toolDir | Out-Null
try {
  Push-Location $repoRoot
  try {
    $numericVersion = (& $go.Source run -mod=mod ./cmd/installer-version $Version | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $numericVersion) {
      throw "installer-version failed for $Version"
    }
  } finally {
    Pop-Location
  }

  $stagedCli = Join-Path $stageDir 'vip-next.exe'
  $stagedHelper = Join-Path $stageDir 'go-search-replace.exe'
  Copy-Item -LiteralPath $cliPath -Destination $stagedCli
  Copy-Item -LiteralPath $helperPath -Destination $stagedHelper
  if ((Get-FileHash -LiteralPath $cliPath -Algorithm SHA256).Hash -ne
      (Get-FileHash -LiteralPath $stagedCli -Algorithm SHA256).Hash) {
    throw 'Staging modified the CLI executable bytes.'
  }
  if ((Get-FileHash -LiteralPath $helperPath -Algorithm SHA256).Hash -ne
      (Get-FileHash -LiteralPath $stagedHelper -Algorithm SHA256).Hash) {
    throw 'Staging modified the helper executable bytes.'
  }

  Copy-Item -LiteralPath $licensePath -Destination (Join-Path $stageDir 'LICENSE.txt')
  [IO.File]::WriteAllText(
    (Join-Path $stageDir '.vip-next-installer.json'),
    '{"schema":1,"manager":"msi"}',
    (New-Object Text.UTF8Encoding($false))
  )
  $licenseRtf = Join-Path $stageDir 'LICENSE.rtf'
  Convert-LicenseToRtf $licensePath $licenseRtf

  $env:DOTNET_ROLL_FORWARD = 'Major'
  Invoke-External $dotnet.Source @(
    'tool', 'install', 'wix', '--tool-path', $toolDir, '--version', $wixVersion
  ) 'Installing the pinned WiX tool failed'
  $wix = Join-Path $toolDir 'wix.exe'
  if (-not (Test-Path -LiteralPath $wix -PathType Leaf)) {
    throw "Pinned WiX executable was not installed at $wix"
  }

  Push-Location $tempRoot
  try {
    Invoke-External $wix @('extension', 'add', $uiExtension) 'Installing the pinned WiX UI extension failed'
    Invoke-External $wix @(
      'build', $wixSourcePath,
      '-arch', 'x64',
      '-ext', $uiExtension,
      '-d', "NumericVersion=$numericVersion",
      '-d', "ProductCode=$(Get-ProductCode $numericVersion)",
      '-d', "StageDir=$stageDir",
      '-d', "LicenseRtf=$licenseRtf",
      '-out', $outputFullPath
    ) 'WiX MSI build failed'
  } finally {
    Pop-Location
  }

  if (-not (Test-Path -LiteralPath $outputFullPath -PathType Leaf)) {
    throw "WiX reported success but did not create $outputFullPath"
  }
} finally {
  [Environment]::SetEnvironmentVariable('DOTNET_ROLL_FORWARD', $originalDotnetRollForward, 'Process')
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
