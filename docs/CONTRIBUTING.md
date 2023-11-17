# Contributing

Thanks for contributing to the VIP-CLI. There are some guidelines to ensure we have consistency across the CLI and web interfaces.

## Developing

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
