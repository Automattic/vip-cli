# VIP CLI

CLI Tools for WordPress.com VIP

## Usage

Show available commands:

```
vip --help
```

You can append `--help` to any sub-command to see options and sub-sub-commands.

## Install

```
npm install -g wpvip-cli
vip login
```

## Development

To start hacking the vip-cli, follow the instructions below.

1. clone this repository: `git clone https://github.com/Automattic/vip-cli`
1. cd to the clonned directory `cd vip-cli`
1. run `npm link`
1. hack the code
1. run `npm install`
1. use the `vip` command with your modified code

### Automattic developers:

Please note, that running the `npm install` will override your local installation on your sandbox and you'll have to `vip login` again.
Once you are done hacking, you'll have to run `npm install -g wpvip-cli@latest` again in order to restore the current production installation on your sandbox.
