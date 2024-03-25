# Architecture

## Basic functionality

This is a CLI for interacting with and managing your [WordPress VIP applications](https://docs.wpvip.com/vip-cli/). Data is inputted and outputted via terminal to the [API offered by WordPress VIP](#communicating-with-wpvip-api) and to/from local filesystem.

For configuration, a few [environmental variables](SETUP.md#environmental-variables) are used and some [configuration files](SETUP.md#configuration-files) as well. No [database](#database) is required.

### Scalability

No specific considerations.

### Communicating with WPVIP API

The CLI communicates primarily with https://api.wpvip.com. An authentication token is required to access the API which the CLI will ask for when executed. Tokens can be retrieved from the [VIP Dashboard](https://dashboard.wpvip.com/).

## Languages & coding standard

Both JavaScript and TypeScript are used to implement the software. **TypeScript should be used for new code.**

We require that the WPVIP defined coding style to be used, defined in [.eslintrc.js](https://github.com/Automattic/vip-cli/blob/trunk/.eslintrc.js).

## Code structure

The code is structured in the following way:

- [.github](https://github.com/Automattic/vip-cli/tree/trunk/.github) — configuration and templates for GitHub.
- [\_\_fixtures\_\_](https://github.com/Automattic/vip-cli/tree/trunk/__fixtures__) — fixtures for testing package.
- [\_\_tests\_\_](https://github.com/Automattic/vip-cli/tree/trunk/__tests__) — testing package.
- [config](https://github.com/Automattic/vip-cli/tree/trunk/config) — configuration files.
- [docs](https://github.com/Automattic/vip-cli/tree/trunk/docs) — documentation package.
- [types](https://github.com/Automattic/vip-cli/tree/trunk/types) - for TypeScript.
- [helpers](https://github.com/Automattic/vip-cli/tree/trunk/helpers) - helper scripts.
- [src](https://github.com/Automattic/vip-cli/tree/trunk/src) - main source code.

## API interfaces

No APIs are offered.

### GraphQL interfaces

No APIs are offered.

## Feature flags

TODO: Do we apply feature flags in this code? Describe how it works.

## Database

No database is needed.

## Dependency services

VIP-CLI communicates with a few services via APIs:

- [WPVIP API](#communicating-with-wpvip-api).
- https://public-api.wordpress.com/rest – for analytics (can be [disabled](SETUP.md#analytics)).

## Development

Here are guidelines to ensure we have consistency across the CLI and web interfaces.

### Adding commands

- New command names should use the singular form (e.g. site vs sites).
- Add new commands to `package.json#bin`.
- Run `npm link` so that `arg` knows how to spawn the command locally. (Skipping this step will result in `Error: spawn vip-command ENOENT`.)

### Adding libraries

New libraries should generally support both CLI and web contexts, though some cases that won't make sense (e.g. formatting for CLI output). Ensuring the libraries are useful everywhere will allow us to offer consistent experiences regardless of the interface.

### go-search-replace binaries

Some unit tests require some go-search-replace executable binary files to run. Binaries files for
several OS architectures can be downloaded
from https://github.com/Automattic/go-search-replace/releases/

If, for some reason, you need to compile these binaries yourself, please follow instructions
at https://github.com/Automattic/go-search-replace

### Generating the types

If you're an employee of Automattic, you can follow these steps to regenerate the GraphQL types
used.

1. Get a hold of `schema.gql` and paste it in project root - this is the schema of the endpoint that
   we communicate with.
2. Run `npm run typescript:codegen:install-dependencies` - this will install the codegen
   dependencies without updating `package.json`
3. Run `npm run typescript:codegen:generate` - this will regenerate the types.

## Alerting

There are no alerts.
