# Updating the standalone Go CLI

`vip-next` can check for and install newer 5.x releases from the
[official GitHub releases](https://github.com/Automattic/vip-cli/releases).
This feature is specific to the Go runtime; the Node CLI retains its npm
update notifier.

```sh
vip-next update
vip-next update --check
vip-next update --channel preview
vip-next update --channel stable
```

For portable archive installations, `update` authorizes installation without
another prompt, including in non-interactive mode. For native installer
installations, interactive runs download and open the matching installer;
non-interactive runs print its direct download link. `--check` reports
availability without downloading files or opening an installer. A successful check exits zero whether or not an update
exists; a failed check or installation exits nonzero. Neither command needs a
VIP login. Updates use the existing `VIP_PROXY` / `VIP_USE_SYSTEM_PROXY` policy.

## Release channels

Without an explicit preference, a prerelease installation follows newer
previews through the stable release, then follows stable releases. Selecting
`--channel preview` keeps following previews even after installing a stable
release. `--channel stable` follows stable releases only. The preference is
saved after a successful operation. Combining `--check --channel preview`
changes that preference without installing binaries.

Updates never downgrade. If the selected stable channel is behind an installed
preview, the CLI waits for a newer stable release. Development builds, including
`5.0.0-dev.<commit>`, must be replaced manually with an official release first.

## Notifications

Interactive invocations check at most once every 24 hours after a successful
check. A request runs alongside the current command and has a five-second
limit. The command never waits for that request at exit; very short commands
may finish without refreshing the cache. There is no scheduled process.
Completed failed checks back off for one hour and do not fail ordinary commands.

Notices appear on interactive stderr. Automatic checks and notices are disabled
in CI, tests, non-interactive use, JSON/CSV output, help/version, raw `wp`
commands, and update commands. Set `VIP_NO_UPDATE_NOTIFIER=1` to disable automatic
checks; explicit update commands still check immediately.

The cache is under the operating system's user cache directory in `vip/update/`.
The explicit channel preference is under the user configuration directory in
`vip/update.json`. These files are separate from credentials.

## Installation and recovery

The updater downloads the matching archive and SHA-256 file, verifies them,
and checks that the archive contains exactly the two executables for the target
platform. If GitHub supplies an asset digest, that digest must match too.
This trusts the official GitHub release over HTTPS; the checksums are not an
independent publisher signature. Binary bytes, including existing code
signatures, are preserved. The updater does not perform a separate native
signer or notarization assessment.

Both executables are staged before installation. Progress reports each step:

```text
Downloading 5.0.0-alpha.4… ✓
Verifying download… ✓
Updating vip-next… ✓
Updating go-search-replace… ✓
Updated to 5.0.0-alpha.4
```

The updater replaces the CLI and its bundled helper sequentially, retaining
backups until both succeed. Ordinary failures attempt to restore the original
files. If restoration fails, the error identifies the recovery record and backup
paths. Inspect those paths and restore the original files or reinstall the
complete release archive before retrying. The updater does not silently resume
an incomplete update.

This is not a crash-proof two-file transaction. Power loss or forced termination
can require manual restoration, and another CLI process can observe the interval
between replacements. Windows may retain the old loaded executable as a backup
until a subsequent explicit update can remove it.

The real CLI path is resolved through any entrypoint symlink. The bundled helper
is selected from the executable directory's `bin/` subdirectory first, then from
beside the CLI. PATH and `VIP_SEARCH_REPLACE_BIN` targets are never overwritten;
an active override continues to control helper execution.

Recognized package-managed installations receive package-manager instructions
instead of file replacement. Installations created by the macOS `.pkg` or
Windows `.msi` contain `.vip-next-installer.json` beside the binaries; keep this
file intact. When an update is available, interactive `vip-next update` runs
show the installed and available versions, download the matching `.pkg` or
`.msi` for the selected release channel and architecture, verify its SHA-256
checksum and any GitHub asset digest, and open the native installer. Complete
the installation and any administrator approval in that window. On Windows,
the handoff uses [Windows Installer](https://learn.microsoft.com/windows-server/administration/windows-commands/msiexec)
with its normal UI and automatic restarts disabled.

Opening the installer is a handoff, not confirmation that the upgrade succeeded.
After it finishes, run `vip-next --version` to verify the installed version.
The downloaded package stays in a unique directory under `vip/update/` in the
user cache; its path is printed and it can be deleted after installation. If
opening the installer fails, the command exits nonzero and prints that path
so you can run the verified package manually.

With `--non-interactive`, `VIP_NON_INTERACTIVE=1`, or non-terminal stdin,
`update` prints an exact installer download link without downloading or
opening anything. `--check` remains informational. A release missing its
matching installer or checksum produces an explicit error; the updater never
substitutes an older installer or a portable archive. Homebrew, Scoop, and
other recognized package managers retain their own upgrade instructions.
See [native installer installation and upgrades](BUILD-SIGNING.md#native-installers).

Missing bundles, ambiguous layouts, and unwritable
locations require manual installation. The updater itself does not elevate privileges.
Supported release assets are macOS and Linux amd64/arm64, and Windows amd64.
