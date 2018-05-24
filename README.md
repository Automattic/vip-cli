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

1. clone the repository: `git clone https://github.com/Automattic/vip-cli`
1. cd to the cloned directory `cd vip-cli`
1. run `npm install` to install dependencies
1. hack the code
1. Build: `npm run-script build` is the quickest way to build
1. test your changes by calling `node build/bin/vip.js`

Note: Your development version will use the same config as the globally installed module and any changes to the config will impact that.
