# VIP (Internal) CLI

Internal CLI Tools for VIP Go Sandboxes and [the Goop API](https://github.com/Automattic/vip-go-api).

## Usage

Show available commands:

```
vipgo --help
```

You can append `--help` to any sub-command to see options and sub-sub-commands.

## Install

Make sure you have an open connection to the Automattic proxy and are able to
tunnel local traffic to port 8080.

```
npm install -g wpvip-cli
vipgo config PROXY=socks://127.0.0.1:8080
vipgo login
```

## Development

To start hacking:

1. Clone this repository.
1. `cd` to the cloned directory.
1. Run `npm install` to install dependencies.
1. Hack the code.
1. Build your changes using `npm run build`.
1. Test your changes by calling `node build/bin/vip.js`.

**Note 1:** Your development version will use the same config as the globally installed module and any changes to the config will impact that.

**Note 2:** You can use `npm link` to link your development copy with your globally installed version to simplify development.

## Publishing a New Release

### Major / Minor Versions

1. Set the version: `npm version minor`
1. `git push --tags`
1. `npm publish`
1. Edit the release in Github to include a description of the changes
1. Manually bump the version in `package.json` to the next minor and append `-dev`
1. `git push`

Note: doing the last two steps can help with debugging in case someone is running the dev version (via `vipgo -V`).

### Patch Version

For a critical fix (or a small number of fixes), we can `git checkout` the last release and add/or cherry-pick some changes. 

Then bump the version number with `npm version patch` and `npm publish`. This is especially nice if there are already some bigger changes in the master branch and you don’t want to push a normal release.

### Caveats

* We don’t publish the `src` directory because it's not used and just makes builds larger (skipped via [`.npmignore`](https://github.com/Automattic/vip-cli/blob/master/.npmignore)).
