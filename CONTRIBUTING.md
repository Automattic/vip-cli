# Contributing

Thanks for contributing to the VIP-CLI. There are some guidelines to ensure we have consistency across the CLI and web interfaces.

## Coding Standards

The VIP-CLI uses [`eslint-config-wpvip`](https://github.com/Automattic/eslint-config-wpvip) for coding standards.

Tests are powered by [Jest](https://jestjs.io).

## Developing

### Local Dev

To test against a local instance of Parker, you can use the `API_HOST` env var. You'll also want to nullify the `VIP_PROXY` env var as well.

Examples:

```
VIP_PROXY="" API_HOST=http://localhost:4000 node ./dist/bin/vip

VIP_PROXY="" API_HOST=http://localhost:4000 node ./dist/bin/vip app

VIP_PROXY="" API_HOST=http://localhost:4000 node ./dist/bin/vip -- wp option get home
```

### Adding commands

* New command names should use the singular form (e.g. site vs sites).
* Add new commands to `package.json#bin`.
* Run `npm link` so that `arg` knows how to spawn the command locally. (Skipping this step will result in `Error: spawn vip-command ENOENT`.)

### Adding libraries

New libraries should generally support both CLI and web contexts, though some cases that won't make sense (e.g. formatting for CLI output). Ensuring the libraries are useful everywhere will allow us to offer consistent experiences regardless of the interface.

## Release & Deployment Process

Our release flow for VIP CLI follows this pattern:

**_feature branch -> develop branch -> master branch -> NPM release_**

- For feature branches, please follow A8C branch naming conventions (e.g.- `add/data-sync-command`, `fix/subsite-launch-command`, etc.)
- Include a Changelog for all npm version releases, including any minor or major versions
- This is a public repository. Please do not include any internal links in PRs, changelogs, testing instructions, etc.
- Merge changes from your feature branch to the `develop` branch
- Please do not merge any changes into the `master` branch yet. All features/changes that are not ready to be public should stay in the `develop` branch to avoid conflicts when releasing urgent fixes.
- Changes from the `develop` branch are merged to `master` and released on NPM following our release schedule
- Any team member that is part of our NPM organization can release new minor or major versions, but please have a Customer Experience (Pâtisserie) team member look over the changes first.

### Changelogs
Changelogs allow customers to keep up with all the changes happening across our VIP Platform. Changelogs for VIP CLI are posted to the [VIP Cloud Changelog P2](https://wpvipchangelog.wordpress.com/), along with the repository’s `README.md`.

### Release Schedule

The VIP Customer Experience squad conducts releases on Tuesdays from 4AM to 5PM Pacific Time (US). Releases are regular but do not happen every Tuesday. Please coordinate with the VIP Customer Experience squad if you'd like to lead your own release.

As part of the release process, our squad merges changes from the `develop` branch to the `master` branch. Therefore, do not merge changes into `develop` unless it is ready for release (or use a feature flag to disable it).

Fixes for urgent or breaking bugs may be merged straight to the `master` branch and released publicly via `npm` at any time outside of our release window. All other changes should participate in our release window.

## Releasing / Publishing

### Pre-publish Checks

We use [`publish-please`](https://github.com/inikulin/publish-please) for some pre-publish confidence checks to avoid common mistakes.

Further checks can be added to this flow as needed.

### Pre-publish Tasks

As part of the publish flow, we run the `prepareConfig:publish` task on `prepack`. This copies over "production" config values to your working copy to make sure the release includes those instead of development values.

We use `prepack` because:

- `prepareConfig:local` runs on `npm build` and we want to make sure those values are overriden.
- This is the latest npm event that we can run on before publishing. (Note: we tried `prepublishOnly` but files added during that step [don't get included in the build](https://github.com/Automattic/vip/commit/c7dabe1b0f73ec9e6e8c05ccff0c41281e4cd5e8)).

### New Releases

Prepare the release by making sure that:

1. All relevant PRs have been merged.
1. The release has been tested across macOS, Windows, and Linux.
1. The [changelog](https://github.com/Automattic/vip/blob/master/README.md#changelog) has been updated on `master`.
1. All tests pass and your working directory is clean (we have pre-publish checks to catch this, just-in-case).

#### Changelog Generator Hint:

```
export LAST_RELEASE_DATE=2021-08-25T13:40:00+02
gh pr list --search "is:merged sort:updated-desc closed:>$LAST_RELEASE_DATE" | sed -e 's/\s*\S\+\s*\S\+\s*$//' -e 's/^/- #/'
```

Then, let's publish:

1. Make sure master branch is up to date `git pull`
1. Set the version (via `npm version minor` or `npm version major` or `npm version patch`)
1. For most regular releases, this will be `npm version minor`.
1. Push the tag to GitHub (`git push --tags`)
1. Push the master branch `git push`
1. Make sure you're part of the Automattic organization in npm
1. Publish the release to npm (`npm run publish-please --access public`)
1. Edit [the release on GitHub](https://github.com/Automattic/vip/releases) to include a description of the changes and publish (this can just copy the details from the changelog).
1. Push `master` changes (mostly the version bump) to `develop` (`git checkout develop && git merge master` )

Once released, it's worth running `npm i -g @automattic/vip` to install / upgrade the released version to make sure everything looks good.

### Test Releases

Sometimes, we want to release a version we can test before releasing it to the public. In order to that, we need to release it under a tag other than `latest`, usually `next`. By default, `npm` install from the `latest` tag, so if `@next` isn't specified explicitely in the installation command like `npm install @automattic/vip@next`, a user will not get this version.

In order to do that, please follow this:

1. Manually change the version in `package.json` and `package-lock.json` to a dev version. Example: `1.4.0-dev1`
2. Go to publish-please's config in `.publishrc`
3. Change the `publishTag` to `next` and `gitTag` to `false` (publish-please will expect the latest commit to have a git tag, but we don't want it in this case)
4. Commit your changes to `master`
5. Run `npm run publish-please`

You can repeat this with every new version until you're happy with your version and ready to a public release. We currently don't support multiple branches for multiple versions. When it's the case, this process needs to be done for every version in every branch.

### Patching Old Releases

There may be times when we need to push out a critical fix to the most recent release (or several past releases) such as for patching security issues or major bugs. This can be complicated by the fact that we may have some larger changes already merged into the `master` branch.

For these cases:

1. `git checkout` to the tag of the previous release.
1. Apply the fix (either manually or by cherry-picking).
1. Follow the release steps outlined above (as a `patch` release).

Then, repeat for any additional versions that we need to patch.

### go-search-replace binaries

Some unit tests require some go-search-replace executable binary files to run. Binaries files for several OS architectures can be downloaded from https://github.com/Automattic/go-search-replace/releases/

If, for some reason, you need to compile these binaries yourself, please follow instructions at https://github.com/Automattic/go-search-replace