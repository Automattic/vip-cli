# Shared Azure setup and signing for independent binary and installer jobs.
$ErrorActionPreference = 'Stop'

Write-Host "--- :closed_lock_with_key: Azure Trusted Signing"
$setupScript = (Get-Command setup_azure_trusted_signing.ps1 -ErrorAction Stop).Source
& $setupScript
if ($LASTEXITCODE -ne 0) { throw 'setup_azure_trusted_signing.ps1 failed' }

function Sign-File([string]$path) {
  Write-Host "--- :closed_lock_with_key: Authenticode sign $path"
  & $env:SIGNTOOL_PATH sign /v `
    /fd $env:AZURE_FILE_DIGEST `
    /tr $env:AZURE_TIMESTAMP_SERVER `
    /td $env:AZURE_TIMESTAMP_DIGEST `
    /dlib $env:AZURE_CODE_SIGNING_DLIB `
    /dmdf $env:AZURE_METADATA_JSON `
    $path
  if ($LASTEXITCODE -ne 0) { throw "signtool sign failed for $path" }
  & $env:SIGNTOOL_PATH verify /pa /v $path
  if ($LASTEXITCODE -ne 0) { throw "signtool verify failed for $path" }
}
