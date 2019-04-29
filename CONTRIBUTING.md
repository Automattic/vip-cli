# Contributing

Thanks for contributing to the VIP Javascript library. There are some guidelines to ensure we have consistency across the CLI and web interfaces.

## Coding Standards

The VIP-CLI uses [`eslint-config-wpvip`](https://github.com/Automattic/eslint-config-wpvip) for coding standards.

Tests are powered by [Jest](https://jestjs.io).

## Developing

### Adding commands

* New command names should use the singular case (e.g. site vs sites)

### Adding libraries

New libraries should generally support both CLI and web contexts, though some cases that won't make sense (e.g. formatting for CLI output). Ensuring the libraries are useful everywhere will allow us to offer consistent experiences regardless of the interface.

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

Then, let's publish:

1. Set the version (via `npm version minor` or `npm version major` or `npm version patch`)
 1. For most regular releases, this will be `npm version minor`. 
1. Publish the release to npm (`npm run publish-please`)
1. Push the tag to GitHub (`git push --tags`)
1. Edit [the release on GitHub](https://github.com/Automattic/vip/releases) to include a description of the changes and publish (this can just copy the details from the changelog).
1. Bump the version to the next minor: `npm --no-git-tag-version version preminor`
1. Commit and push (`git add -u` + `git commit` + `git push origin master`).

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
