# Recover an interrupted stable npm release

Use this when the stable publishing workflow created a GitHub release and tag,
but failed before publishing that version to npm.

1. Ensure the recovery workflow is merged into `trunk`.
2. Open **Actions → Publish to npm (if applicable) → Run workflow**.
3. Select branch **trunk**, set **release_mode** to **recover-stable**, and enter
   the existing tag in **release_version** (for example, `4.1.2`).
4. Leave **npm_tag** unchanged; stable recovery always publishes to `latest`.
5. Select **Run workflow** and inspect the **Recover stable release** job.

Do not rerun the original failed run to pick up workflow changes: reruns retain
the original workflow. The original action also tries to recreate the existing
GitHub release before it reaches npm publishing.

Recovery builds and tests the existing tag, preserves the GitHub release, and
uses the same workflow identity and `npm-publish` environment for npm trusted
publishing. It enables npm error logging and refuses versions already published
or older than the current `latest`. Successful publication starts the changelog
and command-reference documentation jobs.

Recovery does not create the next development-version PR that the regular
publishing action normally opens after publication. Handle that version bump
separately once recovery succeeds. If npm publication succeeds but a downstream
documentation job fails, rerun only the failed jobs.

## How the release artifact is prepared

Stable releases, prereleases and recovery use the local
[release tooling](../.github/scripts/npm-release/README.md) in this repository.
No `vip-actions` changes are required. After building and testing, it runs the
prepublish/pack preparation hooks in the source checkout and uses `rsync -a`
without `-H` to copy into a fresh staging directory. This turns native dependency
hard links into independent files without changing the source checkout's links. The workflow saves the current
release tools before checking out an old tag, so that tag need not contain the
new helper.

The helper packs with lifecycle scripts disabled, validates the archive and runs
`smoke:release` inside an extraction of that exact tarball. Validation rejects
links and unsafe archive entries and verifies the package name/version. Both
the dry run and real publication use the same validated `.tgz` with
`--ignore-scripts`, so another build cannot recreate hard links after validation.

For `4.1.2`, the Linux builds of bundled `cpu-features` and `ssh2` created three
hard links that npm rejected with `E415: Hard link is not allowed`. Staging fixes
the archive while preserving dependency bundling and the existing release tag.
