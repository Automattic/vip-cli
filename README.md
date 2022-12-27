VIP-CLI is your tool for interacting with and managing your VIP applications.

## Getting started

First, install the package:

```
npm install -g @automattic/vip
```

The above command may fail in linux if you do not have `make` and `g++` installed. In that case, install them first:

```
sudo apt install make g++
```

Then, launch the command and follow the prompts:

```
vip
```

If you need more information, check out our [VIP-CLI documentation](https://docs.wpvip.com/technical-references/vip-cli/).

## Contributing

For help with contributing to this project, including instructions for local development, please see [CONTRIBUTING](CONTRIBUTING.md) and [SECURITY](SECURITY.md).

## Analytics

By default, we record information about the usage of this tool using an in-house analytics sytem. If you would prefer to opt-out of this data collection, you can do so via the `DO_NOT_TRACK` environment variable. You may either export it in your shell configuration or specify it on the command line (e.g. `DO_NOT_TRACK=1 vip app list`).
