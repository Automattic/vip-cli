# Contributing

Thanks for contributing to the VIP Javascript library. There are some guidelines to ensure we have consistency across the CLI and web interfaces.

## Coding Standards

TODO

## Developing

### args package

TODO

### Adding commands

* New command names should use the singular case (e.g. site vs sites)

### Adding libraries

New libraries should generally support both CLI and web contexts, though some cases that won't make sense (e.g. formatting for CLI output). Ensuring the libraries are useful everywhere will allow us to offer consistent experiences regardless of the interface.

## Releasing

Note: We use `publish-release` for some pre-publish confidence checks to avoid common mistakes.

### Major / Minor Versions

1. Set the version: `npm version minor` or `npm version major`
1. `npm run publish-please`
1. `git push --tags`
1. Edit the release in Github to include a description of the changes and publish.
1. Bump the version to the next minor: `npm --no-git-tag-version version preminor`
1. Commit and push.

Note: doing the last two steps can is useful for debugging in case someone is running the dev version (via `vip version`).

### Patch Version

For a critical fix, we can `git checkout` a previous release and cherry-pick or apply specific changes. This is especially useful for security releases and if there are already some bigger changes in the master branch and you don't want to push a normal release.

The release steps are the same as `Major / Minor` except that we would run `npm version patch`.
