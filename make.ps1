<#
.SYNOPSIS
  PowerShell port of the Makefile for building/testing vip-next on native Windows.
  (On macOS/Linux/WSL use the Makefile: `make build`, `make test`, ...)

.USAGE
  powershell -ExecutionPolicy Bypass -File .\make.ps1 <target>
  # or, in a session that already allows scripts:
  .\make.ps1 build

  Targets:
    build              Build bin\vip-next.exe (version-stamped) + bundle go-search-replace.exe
    search-replace-bin Bundle the host go-search-replace binary next to vip-next (called by build)
    test               go test ./...            (the whole suite)
    test-parity        go test -tags=parity ./internal/parity/...
    lint               go vet ./...
    tidy               go mod tidy
    tidy-gql           Regenerate internal/gql/generated.go via genqlient
    verify-gql-stale   Fail if generated.go is stale vs schema/operations (working tree untouched)
    clean              Remove bin\

  Notes:
    * Requires Go 1.27. `encoding/json/v2` is part of the standard library.
    * If running scripts is blocked, prefix with:  powershell -ExecutionPolicy Bypass -File .\make.ps1 ...
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('build', 'search-replace-bin', 'test', 'test-parity', 'lint', 'tidy', 'tidy-gql', 'verify-gql-stale', 'clean', 'help')]
    [string]$Target = 'build'
)

$ErrorActionPreference = 'Stop'

# --- config (mirrors the Makefile vars) ---
$GO       = if ($env:GO) { $env:GO } else { 'go' }
$BinDir   = 'bin'
$BinName  = 'vip-next.exe'
$BinPath  = Join-Path $BinDir $BinName

# Run a Go command and stop on a non-zero exit (PowerShell doesn't do this for native exes by default).
function Invoke-Go {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GoArgs)
    Write-Host "+ $GO $($GoArgs -join ' ')" -ForegroundColor DarkGray
    & $GO @GoArgs
    if ($LASTEXITCODE -ne 0) { throw "go $($GoArgs[0]) failed (exit $LASTEXITCODE)" }
}

# LDFLAGS: version/commit from git, with the same fallbacks as the Makefile.
function Get-LdFlags {
    # Windows PowerShell 5.1 promotes native git stderr ("not a git repository") to a
    # terminating error under this script's $ErrorActionPreference='Stop' -- even with 2>$null --
    # which kills the intended dev/unknown fallback when building outside a git checkout
    # (e.g. from a source tarball). Scope the preference down for the git probes below.
    $ErrorActionPreference = 'SilentlyContinue'
    $version = (& git describe --tags --always --dirty 2>$null)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($version)) { $version = 'dev' }
    $commit = (& git rev-parse --short HEAD 2>$null)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($commit)) { $commit = 'unknown' }
    $pkg = 'github.com/Automattic/vip/internal/version'
    return "-s -w -X $pkg.Version=$version -X $pkg.Commit=$commit"
}

function Target-Build {
    New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
    $env:CGO_ENABLED = '0'
    $ldflags = Get-LdFlags
    Invoke-Go build '-buildvcs=false' '-trimpath' '-ldflags' $ldflags '-o' $BinPath './cmd/vip-next'
    Write-Host "built $BinPath" -ForegroundColor Green
    Target-SearchReplaceBin
}

# Bundle the host's go-search-replace binary next to vip-next so `import sql`
# (--search-replace) and `dev-env sync sql` resolve it without a runtime download.
# (Not needed for the dev-env hosts feature, but kept for Makefile parity.)
function Target-SearchReplaceBin {
    $os   = (& $GO env GOOS).Trim()
    $arch = (& $GO env GOARCH).Trim()
    $fixture = switch ("$os/$arch") {
        'darwin/arm64'  { 'go-search-replace-test-darwin-arm64' }
        'darwin/amd64'  { 'go-search-replace-test-darwin-x64' }
        'linux/amd64'   { 'go-search-replace-test-linux-x64' }
        'windows/amd64' { 'go-search-replace-test-win32-x64.exe' }
        default         { $null }
    }
    if (-not $fixture) {
        Write-Host "no bundled go-search-replace for $os/$arch; set VIP_SEARCH_REPLACE_BIN to use sync/search-replace" -ForegroundColor Yellow
        return
    }
    $src  = Join-Path '__fixtures__/search-replace-binaries' $fixture
    $dest = Join-Path $BinDir ('go-search-replace' + $(if ($os -eq 'windows') { '.exe' } else { '' }))
    if (Test-Path $src) {
        Copy-Item -Force $src $dest
        Write-Host "bundled go-search-replace -> $dest" -ForegroundColor Green
    }
    else {
        Write-Host "fixture $src missing; set VIP_SEARCH_REPLACE_BIN to use sync/search-replace" -ForegroundColor Yellow
    }
}

function Target-Test         { Invoke-Go test './...' }
function Target-TestParity   { Invoke-Go test '-tags=parity' './internal/parity/...' }
function Target-Lint         { Invoke-Go vet './...' }
function Target-Tidy         { Invoke-Go mod tidy }
function Target-Clean        { if (Test-Path $BinDir) { Remove-Item -Recurse -Force $BinDir }; Write-Host "cleaned $BinDir" }

# Regenerate internal/gql/generated.go from schema.gql + operations/*.graphql.
function Target-TidyGql {
    Push-Location internal/gql
    try { Invoke-Go run 'github.com/Khan/genqlient' }
    finally { Pop-Location }
}

# Fail if internal/gql/generated.go is stale. Like the Makefile, this NEVER leaves
# the on-disk file altered: it saves the contributor's copy, runs genqlient (which
# overwrites generated.go), compares, and ALWAYS restores the saved copy.
function Target-VerifyGqlStale {
    Push-Location internal/gql
    $stash = [System.IO.Path]::GetTempFileName()
    try {
        Copy-Item -Force 'generated.go' $stash
        Invoke-Go run 'github.com/Khan/genqlient'
        $same = $null -eq (Compare-Object (Get-Content $stash) (Get-Content 'generated.go'))
        if ($same) {
            Write-Host 'internal/gql/generated.go is up to date' -ForegroundColor Green
        }
        else {
            Write-Host ''
            Write-Host 'ERROR: internal/gql/generated.go is stale relative to schema.gql / operations/*.graphql.' -ForegroundColor Red
            Write-Host "Run '.\make.ps1 tidy-gql' and commit the regenerated file."
            throw 'generated.go is stale'
        }
    }
    finally {
        Copy-Item -Force $stash 'generated.go'   # always restore the contributor's copy
        Remove-Item -Force $stash -ErrorAction SilentlyContinue
        Pop-Location
    }
}

function Target-Help { Get-Help $PSCommandPath -Detailed }

switch ($Target) {
    'build'              { Target-Build }
    'search-replace-bin' { Target-SearchReplaceBin }
    'test'               { Target-Test }
    'test-parity'        { Target-TestParity }
    'lint'               { Target-Lint }
    'tidy'               { Target-Tidy }
    'tidy-gql'           { Target-TidyGql }
    'verify-gql-stale'   { Target-VerifyGqlStale }
    'clean'              { Target-Clean }
    'help'               { Target-Help }
}
