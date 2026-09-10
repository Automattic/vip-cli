# VIP CLI npm release tooling

The local `.github/actions/npm-release` composite action runs `publish.sh` for
stable releases and `publish-prerelease.sh` for prereleases. Recovery calls
`pack.sh` directly. These scripts replace the npm publishing actions previously
used from `Automattic/vip-actions`; no change to that repository is required.

Stable publishing retains release-PR file/type validation, release branch and
clean-checkout checks, build/tests, GitHub release creation, npm publication and
the next development-version PR. Prereleases retain their selected npm tag,
clean-checkout check, build/tests and prerelease creation. The workflow supplies
npm trusted publishing credentials and keeps the existing permissions and
`npm-publish` environment. GitHub errors during release-PR inspection stop the
release. Only `npm version` uses silent logging to keep its captured version
string clean.

## Artifact preparation

`pack.sh SOURCE OUTPUT TAG [SMOKE_SCRIPT]` expects a built and tested checkout,
plus an existing output directory outside that checkout. Requires Node/npm,
`rsync`, Python 3 and `tar`, available on GitHub-hosted Ubuntu runners. It never
publishes.

The helper runs `prepublishOnly`, `prepack` and `prepare` in the source checkout
with the npm token cleared. It copies to a fresh temporary directory using
`rsync -a` **without `-H`**, so native build hard links become independent files.
It then packs with lifecycle scripts disabled, validates package identity and
rejects links, duplicate paths and unsafe entries. `postpack` runs in the source
checkout after packing. `smoke:release` runs inside an extraction of that exact
archive using bundled dependencies.

The only stdout is the validated tarball's absolute path. Build output goes to
stderr. The staging directory is always cleaned; the caller owns output cleanup.
Dry-run and publication use that exact tarball with `--ignore-scripts`. Neither
rebuild nor repack afterward. Directory `publish`/`postpublish` hooks are not run;
VIP CLI does not define them.

The workflow saves these tools under `RUNNER_TEMP` before changing the source
checkout. This lets recovery build an old release tag, such as `4.1.2`, using
tools from the workflow revision without adding or changing files in that tag.

## Tests

```sh
python3 -m unittest discover -s .github/scripts/npm-release/tests -v
shellcheck .github/scripts/npm-release/*.sh
actionlint .github/workflows/npm-publish.yml .github/workflows/npm-release-tests.yml
```

Tests build real fixture archives without registry access. Publisher integration
tests mock GitHub, git and npm publication, so they cannot publish or create
remote releases. The Ubuntu packaging workflow runs them separately from CLI
runtime tests.
