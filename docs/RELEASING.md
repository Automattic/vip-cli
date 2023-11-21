# Releasing

Please familiarize yourself with the [SETUP.md](SETUP.md) file before releasing.

## New pull requests

Follow these steps for new pull requests:

1. Please note the publishing method (see [below](#releasing-a-new-version)).

1. Ensure when you create your pull request that:

   a. It merges to `trunk`. The release flow for VIP-CLI follows this pattern: **_feature branch -> `trunk` branch_**

   b. The feature branch follows A8C branch naming conventions, e.g.: `add/health-query`, `fix/subsite-mutation`, etc.

   c. The pull request code and description contain no sensitive information. Please do not include any internal links in PRs, changelogs, testing instructions, etc. as this is a public repository.

   d. You have included changelog entry by adding a `## Changelog Description` section to the GitHub pull request description. All changelogs are posted to the [VIP Cloud Changelog P2](https://wpvipchangelog.wordpress.com/) which customers can view and follow.

1. Once you've created your pull request, ensure that:

   a. You have added [all the automated tests required](TESTING.md#automated-testing).

   b. You have completed [manual testing of your change](TESTING.md#manual-testing).

1. If updating a dependency (NPM package or Node), follow the [guidelines on updating dependencies](SETUP.md#updating-dependencies).

1. Have your pull request reviewed by a colleague and approved — especially if it is a large change or a complex addition.

1. Verify that your pull request passes all automated tests.

1. Merge your pull request.

## Preparing for release

A few steps should be completed before releasing:

1. Verify that [all relevant pull requests](https://github.com/Automattic/vip-cli/pulls) are merged.

1. The [changelog](CHANGELOG.md) file in the repository should be [amended](#changelog-generation) to.

1. Please note the publishing method (see [below](#releasing-a-new-version)).

1. Determine strategy to [respond to problems post-deployment](#in-case-of-problems).

1. The release has been tested across macOS, Windows, and Linux.

1. All tests pass and your working directory is clean (we have pre-publish checks to catch this,
   just-in-case).

1. You have completed [final testing before deployment](TESTING.md#final-testing-before-releasing).

1. The pre-publish [script](https://github.com/Automattic/vip-cli/blob/trunk/helpers/prepublishOnly.js) has been run. This script performs some confidence checks to avoid common mistakes.

1. Finally, release your changes as a [new minor or major NPM version](#releasing-a-new-version).

If you need to publish a security release, see [details below](#patching-old-releases).

### Changelog generation

Run the following to generate a changelog entry for CHANGELOG.md:

```bash
export LAST_RELEASE_DATE=2021-08-25T13:40:00+02
gh pr list --search "is:merged sort:updated-desc closed:>$LAST_RELEASE_DATE" | sed -e 's/\s\+\S\+\tMERGED.*$//' -e 's/^/- #/'
```

## Releasing a new version

You can release either using GitHub Actions or locally.

### Publishing via GitHub Actions (preferred)

This is the preferred method for pushing out the latest release. The workflow runs a bunch of validations, generates a build, bump versions + tags, pushes out to npm, and bumps to the next dev version.

Please keep in mind internal guidelines before releasing.

To release, follow these steps:

1. Initiate the [release process here](https://github.com/Automattic/vip-cli/actions/workflows/npm-prepare-release.yml).
1. On the right-hand side, select "Run Workflow".
1. Pick your preferred version bump.
1. Click `Run Workflow`.
1. Wait for a pull request to appear. The pull request will update the version number and shall be assigned to you.
1. When ready, merge the pull request. This will lead to a new version to be [published on npmjs.com](https://www.npmjs.com/package/@automattic/vip).
1. Another pull request will be created to bump to a development version, also assigned to you. Merge it to finish the process.

#### Versioning Guidelines

- `patch`: for non-breaking changes/bugfixes and small updates.
- `minor`: for some new features, bug fixes, and other non-breaking changes.
- `major`: for breaking changes.

#### Note on NPM token

Publishing via the GitHub Action requires that the `NPM_TOKEN` be set correctly in GitHub Actions secrets. This should be an npm token generated for a bot user on [the npm @automattic org](https://www.npmjs.com/settings/automattic) that has publish access to this repo.

### Alternative methods of releasing

#### Publishing locally

To publish locally, follow these steps:

<summary><details>

1. Create a pull request that adds the next version's changelog into `trunk`. Use the Changelog
   Generate Hint above to generate the changelog, and refer to previous releases to ensure that your
   format matches.
1. Merge it after approval.
1. Make sure `trunk` branch is up-to-date: `git pull`.
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
1. Edit [the release on GitHub](https://github.com/Automattic/vip-cli/releases) to include a description
   of the changes and publish (this can just copy the details from the changelog).

Once released, it's worth running `npm i -g @automattic/vip` to install / upgrade the released version to make sure everything looks good.

</details></summary>

#### Test Releases

Sometimes, we want to release a version we can test before releasing it to the public. In order to that, we need to release it under a tag other than `latest`, usually `next`. By default, `npm` install from the `latest` tag, so if `@next` isn't specified explicitely in the installation command like `npm install @automattic/vip@next`, a user will not get this version.

In order to do that, please follow this:

<summary><details>

1. Manually change the version in `package.json` and `package-lock.json` to a dev version. Example: `1.4.0-dev1`
1. Run `npm publish --tag next` (When `--tag` is specified, we bypass the usual branch protection that doesn't allow you to publish form a brunch other than `trunk`).

You can repeat this with every new version until you're happy with your version and ready to a public release. We currently don't support multiple branches for multiple versions. When it's the case, this process needs to be done for every version in every branch.

</details></summary>

#### Patching Old Releases

There may be times when we need to push out a critical fix to the most recent release (or several past releases) such as for patching security issues or major bugs. This can be complicated by the fact that we may have some larger changes already merged into the `trunk` branch.

<summary><details>

For these cases:

1. `git checkout` to the tag of the previous release.
1. Apply the fix (either manually or by cherry-picking).
1. Follow the release steps outlined above (as a `patch` release).

Then, repeat for any additional versions that we need to patch.

</details></summary>

## In case of problems

TODO: How to revert to a good state in case of problems?
