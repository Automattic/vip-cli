# Bun executable (experimental)

The Node CLI can be packaged as a native executable containing the Bun runtime,
the CLI, its production dependencies, templates, and the pinned search-replace
companion. Build on the same operating system and architecture as the target;
native dependencies prevent treating this as a cross-compilation workflow.
The build and relocated smoke checks have been verified with Bun 1.4.0 on
Linux x64; macOS and Windows execution remain unverified.

From the repository root, with the supported Node/npm versions and Bun installed:

```sh
npm ci
make vendor-search-replace
npm run build:binary
```

The result is `bin/vip-bun` (`bin/vip-bun.exe` on Windows). It can be copied out
of the checkout and run without an installed Node, Bun, npm, or adjacent
configuration directory. It embeds `config/config.publish.json`; local developer
configuration is excluded.

On first use, the executable extracts runtime packages and resources into a
private, content-addressed directory below the user's cache directory:

- `$XDG_CACHE_HOME/vip-cli/standalone-resources` when set to an absolute path.
- `~/Library/Caches/vip-cli/standalone-resources` on macOS.
- `%LOCALAPPDATA%/vip-cli/standalone-resources` on Windows.
- `~/.cache/vip-cli/standalone-resources` otherwise.

The native launcher then starts its own embedded Bun runtime with the extracted
CLI entrypoint. There is one launcher process and one CLI process; authentication,
configuration, and command initialization run only in the CLI process.

Later runs reuse that directory. The cache must be writable on first use and
allow execution of the search-replace companion and loading of native addons.
Credentials and local development environments retain their existing storage
locations. Docker and other tools required by individual commands still need to
be installed on the host. In particular, `edge-workers build` invokes the project's
AssemblyScript toolchain, which requires Node.

The npm/TypeScript build remains `npm run build`. A command such as
`bun build --target=node --format=esm src/bin/vip.ts` creates a JavaScript bundle,
not a native executable. Bundling also changes `__dirname`, so filesystem paths
relative to the original source layout cannot locate configuration and assets.
Use the dedicated build script, which packages the compiled CLI, publish
configuration, and runtime resources while preserving the command loader's
filesystem layout.

The relocated smoke harness runs on Linux with `strace` installed:

```sh
node helpers/bun-binary-smoke.js "$PWD/bin/vip-bun"
node helpers/bun-resource-smoke.js "$PWD/bin/vip-bun"
```

These checks use temporary homes and loopback API fixtures. The resource check
loads the native addon without calling the credential store, bootstraps Lando
with its daemon mocked, and runs an offline SQL replacement. They do not
exercise Docker or modify host trust or hosts entries. This experimental build is separate from
the signed Go release pipeline in [BUILD-SIGNING.md](BUILD-SIGNING.md).
