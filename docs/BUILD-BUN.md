# Bun executable (experimental)

The Node CLI can be packaged as a native executable containing the Bun runtime,
compiled CLI code, its production dependencies, templates, and the pinned
search-replace companion. [Bun supports cross-compiling executables](https://bun.com/docs/bundler/executables#cross-compile-to-other-platforms).
The build script selects the matching keytar addon from the package's shipped
prebuilds and the matching pinned search-replace companion. An optional `--target`
selects an explicit Bun target, for example:

```sh
bash .buildkite/fetch-search-replace.sh windows/amd64
npm run build:binary -- --target bun-windows-x64
```

Fetch the target's search-replace companion before a cross-build, as shown above.
The workflow uses matching runners to execute and verify each artifact before
upload.

Local build and relocated smoke checks use Bun 1.4.2 on Linux x64. The workflow
below executes each listed target on a matching runner before uploading artifacts.

From the repository root, with the supported Node/npm versions and Bun installed:

```sh
npm ci
make vendor-search-replace
npm run build:binary
```

The result is `bin/vip` (`bin/vip.exe` on Windows). It can be copied out
of the checkout and run without an installed Node, Bun, npm, or adjacent
configuration directory. It embeds `config/config.publish.json`; local developer
configuration is excluded.

On first use, the executable extracts runtime packages and resources into a
private, content-addressed directory below the user's cache directory:

- `$XDG_CACHE_HOME/vip-cli/standalone-resources` when set to an absolute path.
- `~/Library/Caches/vip-cli/standalone-resources` on macOS.
- `%LOCALAPPDATA%/vip-cli/standalone-resources` on Windows.
- `~/.cache/vip-cli/standalone-resources` otherwise.

The CLI runs in the executable's Bun process. The build generates lazy loaders
for each command module, so command code is compiled into the binary while only
the selected command is evaluated. The extracted archive holds packages that
need real filesystem paths, the native keytar addon, the publish configuration,
templates, and the search-replace companion. It does not contain a second CLI
entrypoint or a `dist` tree. Bun bytecode compilation caches the compiled CLI
code in the executable to reduce startup parsing time.

Later runs reuse that directory. The cache must be writable on first use and
allow execution of the search-replace companion and loading of native addons.

Measure first-use extraction separately from cached startup. The compiled CLI
and bytecode reduce code-loading work; extraction of filesystem resources is
still required for a fresh cache.

Credentials and local development environments retain their existing storage
locations. Docker and other tools required by individual commands still need to
be installed on the host. In particular, `edge-workers build` invokes the project's
AssemblyScript toolchain, which requires Node.

The npm/TypeScript build remains `npm run build`. A command such as
`bun build --target=node --format=esm src/bin/vip.ts` creates a JavaScript bundle,
not a native executable. Bundling changes `__dirname`, so configuration and
assets use the extracted resource root. Use the dedicated build script to
compile every command loader and package those resources.

The relocated smoke harness runs on Linux with `strace` installed:

```sh
node helpers/bun-binary-smoke.js
node helpers/bun-ci-smoke.js
```

These checks use temporary homes and loopback API fixtures. The resource check
loads the native addon without calling the credential store, bootstraps Lando
with its daemon mocked, and runs an offline SQL replacement. They do not
exercise Docker or modify host trust or hosts entries. This experimental build is separate from
the signed Go release pipeline in [BUILD-SIGNING.md](BUILD-SIGNING.md).

## GitHub Actions builds

[Bun binaries](../.github/workflows/bun-binaries.yml) runs on relevant pull request
changes, pushes to `trunk`, and manual dispatch. Each job builds and tests on its
target architecture.

| Platform    | Architectures | Artifact names            |
| ----------- | ------------- | ------------------------- |
| Linux glibc | amd64, arm64  | `vip-linux-{amd64,arm64}` |
| macOS       | amd64, arm64  | `vip-macos-{amd64,arm64}` |
| Windows     | amd64         | `vip-windows-amd64`       |

Windows 386 is unavailable: [Bun has no 32-bit Windows runtime or compilation
target](https://bun.com/docs/bundler/executables#supported-targets). The workflow
does not substitute an amd64 executable for a 386 build.

Every artifact contains a `.tar.gz` with `vip` (or `vip.exe`) and a separate
SHA256 checksum file. The tar archive preserves Unix executable permissions.
Artifacts are uploaded after relocated help/version, Lando bootstrap with a fake
daemon, native addon loading, and offline companion checks pass. Linux also runs
the handler and `strace` isolation checks. These are unsigned experimental builds;
the workflow does not create or publish releases.
