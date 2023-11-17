# Releasing

## Release & Deployment Process

Our release flow for VIP CLI follows this pattern:

**_feature branch -> trunk branch -> NPM release_**

- For feature branches, please follow A8C branch naming conventions (e.g.- `add/data-sync-command`, `fix/subsite-launch-command`, etc.)
- Include a Changelog entry for all npm version releases, including any minor or major versions. [Changelogs](https://wpvipchangelog.wordpress.com/) allow customers to keep up with all the changes happening across our VIP Platform. The [changelog](https://github.com/Automattic/vip-cli/blob/trunk/CHANGELOG.md) file in the repository should be amended to as well.
- This is a public repository. Please do not include any internal links in PRs, changelogs, testing instructions, etc.
- Merge changes from your feature branch to the `trunk` branch when they are ready to be published publicly.
- Finally, release your changes as a new minor or major NPM version. Ping in the #vip-platform channel to notify folks of a new release, but please feel free to release your changes without any blockers from the team. Any team member that is part of the Automattic NPM organization can release a new version; if you aren't a member, generic credentials are available in the Secret Store.

If you need to publish a security release, see [details below](#patching-old-releases).

## Releasing / Publishing

### Pre-publish Checks

We use a custom pre-publish [script](https://github.com/Automattic/vip/blob/trunk/helpers/prepublishOnly.js) that performs some confidence checks to avoid common mistakes.

Further checks can be added to this flow as needed.

### Versioning Guidelines

- `patch`: for non-breaking changes/bugfixes and small updates.
- `minor`: for some new features, bug fixes, and other non-breaking changes.
- `major`: for breaking changes.

### New Releases

Prepare the release by making sure that:

1. All relevant PRs have been merged.
1. The release has been tested across macOS, Windows, and Linux.
1. All tests pass and your working directory is clean (we have pre-publish checks to catch this,
   just-in-case).
1. Make sure not to merge anymore changes into `develop` while all the release steps below are in
   progress.

You can release either using GitHub Actions or locally.

#### Changelog Generator Hint:

In the first step, you'll need to generate a changelog.

Run the following and copy the output somewhere.

```
export LAST_RELEASE_DATE=2021-08-25T13:40:00+02
gh pr list --search "is:merged sort:updated-desc closed:>$LAST_RELEASE_DATE" | sed -e 's/\s\+\S\+\tMERGED.*$//' -e 's/^/- #/'
```


#### Publishing via GitHub Actions (preferred)

This is the preferred method for pushing out the latest release. The workflow runs a bunch of validations, generates a build, bump versions + tags, pushes out to npm, and bumps to the next dev version.

1. Initiate the [release process here](https://github.com/Automattic/vip-cli/actions/workflows/npm-prepare-release.yml).
1. On the right-hand side, select "Run Workflow".
1. Pick your preferred version bump.
1. Click `Run Workflow`.
1. Wait for a pull request to appear. The pull request will update the version number and shall be assigned to you.
1. When ready, merge the pull request. This will lead to a new version to be [published on npmjs.com](https://www.npmjs.com/package/@automattic/vip).
1. Another pull request will be created to bump to a development version, also assigned to you. Merge it to finish the process.

#### Note on NPM token

Publishing via the GitHub Action requires that the `NPM_TOKEN` be set correctly in GitHub Actions secrets. This should be an npm token generated for a bot user on [the npm @automattic org](https://www.npmjs.com/settings/automattic) that has publish access to this repo.

#### Publishing locally

To publish locally, follow these steps:

1. Create a pull request that adds the next version's changelog into `trunk`. Use the Changelog
   Generate Hint above to generate the changelog, and refer to previous releases to ensure that your
   format matches. 
1. Merge it after approval.
1. Make sure `trunk` branch is up-to-date `git pull`.
1. Make sure to clean all of your repositories of extra files. Run a dangerous, destructive
   command `git clean -xfd` to do so.
1. Run `npm install`.
1. Set the version (via `npm version minor` or `npm version major` or `npm version patch`)
1. For most regular releases, this will be `npm version minor`.
1. Push the tag to GitHub (`git push --tags`)
1. Push the trunk branch `git push`
1. Make sure you're part of the Automattic organization in npm
1. Publish the release to npm (`npm publish --access public`) the script will do some extra checks (
   node version, branch, etc) to ensure everything is correct. If all looks good, the new version
   will be published and you can proceed.
1. Edit [the release on GitHub](https://github.com/Automattic/vip/releases) to include a description
   of the changes and publish (this can just copy the details from the changelog).
1. Push `trunk` changes (mostly the version bump)
   to `develop` (`git checkout develop && git merge trunk` ). There's no need to use a pull request
   to do so.

Once released, it's worth running `npm i -g @automattic/vip` to install / upgrade the released version to make sure everything looks good.

### Test Releases

Sometimes, we want to release a version we can test before releasing it to the public. In order to that, we need to release it under a tag other than `latest`, usually `next`. By default, `npm` install from the `latest` tag, so if `@next` isn't specified explicitely in the installation command like `npm install @automattic/vip@next`, a user will not get this version.

In order to do that, please follow this:

1. Manually change the version in `package.json` and `package-lock.json` to a dev version. Example: `1.4.0-dev1`
1. Run `npm publish --tag next` (When `--tag` is specified, we bypass the usual branch protection that doesn't allow you to publish form a brunch other than `trunk`).

You can repeat this with every new version until you're happy with your version and ready to a public release. We currently don't support multiple branches for multiple versions. When it's the case, this process needs to be done for every version in every branch.

### Patching Old Releases

There may be times when we need to push out a critical fix to the most recent release (or several past releases) such as for patching security issues or major bugs. This can be complicated by the fact that we may have some larger changes already merged into the `trunk` branch.

For these cases:

1. `git checkout` to the tag of the previous release.
1. Apply the fix (either manually or by cherry-picking).
1. Follow the release steps outlined above (as a `patch` release).

Then, repeat for any additional versions that we need to patch.
