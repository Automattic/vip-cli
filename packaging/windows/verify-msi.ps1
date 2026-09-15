#Requires -Version 5.1
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$MSI,
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$CLI,
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$Helper
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
  throw 'MSI payload verification requires Windows and msiexec.'
}

function Resolve-InputFile([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Label does not exist or is not a file: $Path"
  }
  return (Resolve-Path -LiteralPath $Path).ProviderPath
}

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$msiPath = Resolve-InputFile $MSI 'MSI package'
$cliPath = Resolve-InputFile $CLI 'CLI executable'
$helperPath = Resolve-InputFile $Helper 'Helper executable'
$licensePath = Resolve-InputFile (Join-Path $repoRoot 'LICENSE') 'Repository license'
$initialMsiHash = (Get-FileHash -LiteralPath $msiPath -Algorithm SHA256).Hash
$verifyRoot = Join-Path ([IO.Path]::GetTempPath()) ("vip-cli-msi-verify-{0}" -f [Guid]::NewGuid().ToString('N'))
$extractRoot = Join-Path $verifyRoot 'image'
$log = Join-Path $verifyRoot 'admin-extract.log'

New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
try {
  $arguments = @('/a', "`"$msiPath`"", "TARGETDIR=`"$extractRoot`"", '/qn', '/l*v', "`"$log`"")
  $process = Start-Process -FilePath "$env:SystemRoot\System32\msiexec.exe" `
    -ArgumentList $arguments -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "MSI administrative extraction failed with exit $($process.ExitCode)"
  }

  $payloads = @(
    @{ Name = 'vip-next.exe'; Expected = $cliPath },
    @{ Name = 'go-search-replace.exe'; Expected = $helperPath },
    @{ Name = 'LICENSE.txt'; Expected = $licensePath }
  )
  foreach ($payload in $payloads) {
    $payloadFiles = @(Get-ChildItem -LiteralPath $extractRoot -Filter $payload.Name -File -Recurse)
    if ($payloadFiles.Count -ne 1) {
      throw "Expected one $($payload.Name) in MSI, found $($payloadFiles.Count)"
    }
    $actualHash = (Get-FileHash -LiteralPath $payloadFiles[0].FullName -Algorithm SHA256).Hash
    $expectedHash = (Get-FileHash -LiteralPath $payload.Expected -Algorithm SHA256).Hash
    if ($actualHash -ne $expectedHash) { throw "MSI payload bytes differ for $($payload.Name)" }
  }

  $markers = @(Get-ChildItem -LiteralPath $extractRoot -Filter '.vip-next-installer.json' -File -Recurse)
  if ($markers.Count -ne 1 -or
      (Get-Content -LiteralPath $markers[0].FullName -Raw) -ne '{"schema":1,"manager":"msi"}') {
    throw 'MSI ownership marker is missing, duplicated, or invalid.'
  }

  $finalMsiHash = (Get-FileHash -LiteralPath $msiPath -Algorithm SHA256).Hash
  if ($finalMsiHash -ne $initialMsiHash) {
    throw 'MSI administrative extraction modified the source package.'
  }
} catch {
  if (Test-Path -LiteralPath $log) { Get-Content -LiteralPath $log | Write-Host }
  throw
} finally {
  if (Test-Path -LiteralPath $verifyRoot) {
    Remove-Item -LiteralPath $verifyRoot -Recurse -Force
  }
}
