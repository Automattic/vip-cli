# AGENTS: vip-cli

Guide for future agents working on this codebase. Focus on traps, cross-cutting constraints, and preserving command behavior across the Node.js and Go runtimes.

## Repo Orientation

- Node.js entrypoints live in `src/bin` (one file per CLI command) and are compiled to `dist/**`. Do not edit `dist`; rebuild via `npm run build` before publishing.
- Node.js shared logic sits under `src/lib`; GraphQL command wrappers in `src/commands`; fixtures/tests in `__fixtures__` and `__tests__` (E2E lives in `__tests__/devenv-e2e`).
- Go entrypoint and command registration live in `cmd/vip-next/main.go` and `cmd/vip-next/root.go`; Cobra command implementations live in `cmd/vip-next/commands`, shared logic in `internal`, and tests alongside the Go source. Build `bin/vip-next` with `make build`.
- Cross-runtime parity tests live in `internal/parity`, with scenarios in `testdata/parity`.
- Node.js configuration is loaded by `src/lib/cli/config.ts`: prefer `config/config.local.json`, then `config/config.publish.json`. SEA can fall back to the bundled publish config when on-disk lookups return only `ENOENT`; other read/parse failures with no usable file remain fatal. Go uses configuration wired in `cmd/vip-next/main.go` and constants such as `internal/telemetry/config.go`, not this Node.js file loader.

## Command Changes: Both Runtimes Required

- Implement every new command, command enhancement, and command bug fix in both the Node.js and Go runtimes in the same change. A command change is not complete when only one runtime supports it. If one runtime cannot support the change, surface the blocker and get explicit approval for an exception before treating the work as complete.
- Trace and update both command registrations and implementations. For new Node.js bins, update `package.json#bin`, the parent command, and the applicable registry in `src/lib/cli/internal-bin-loader.js` for SEA dispatch. Wire Go commands into their parent Cobra command or `cmd/vip-next/root.go`; do not assume a shared API change updates both clients.
- Preserve parity for command names, aliases, positional arguments, flags, defaults, parsing (including `-x=value` and the `--` boundary), help, and examples. Match app/env resolution, validation, authentication, confirmation prompts, production safeguards, and non-interactive behavior.
- Match observable results: stdout/stderr, output formats and fields, errors and exit codes, API requests, filesystem effects, and telemetry. Reuse each runtime's existing helpers rather than bypassing its safety or middleware contracts.
- Add or update tests in both runtimes and extend the relevant differential scenarios in `internal/parity` and `testdata/parity`. Cover successful execution and applicable validation, error, and confirmation paths using equivalent inputs and fixtures.
- Preserve explicitly documented runtime differences in `docs/CUTOVER-BREAKING-CHANGES.md` and existing parity `expected_drift` entries. Do not add or broaden accepted drift just to make a failing comparison pass; new differences need explicit approval and documentation.
- Before reporting completion, run the relevant Node.js and Go tests plus real Node-vs-Go parity checks. Report exactly what ran, what skipped, and any blockers; a skipped comparison or a mock-only scenario does not establish runtime parity.

## Command Architecture

### Node.js

- Node.js bins use `command()` from `src/lib/cli/command.js`. Its `CommanderArgsCompat` wrapper uses Commander while retaining the chainable command API; `_opts` remains module-scoped. The wrapper's `argv()` adds async parsing, validation, telemetry, and app/env lookup before your handler runs.
- Call shape: `command(opts).option(...).command(...sub...).example(...).argv(process.argv, handler)`. `handler` receives `(subArgsArray, optionsObject)` where `subArgsArray` are positional args (alias removed) and `optionsObject` holds flags plus resolved `app`/`env` when requested.
- `_opts` knobs: `appContext`/`envContext`/`childEnvContext` run GraphQL lookups (using `appQuery` + optional fragments) and interactive prompts when `--app/--env` are missing; `childEnvContext` forbids production. `requiredArgs` enforces positional count; `wildcardCommand` disables subcommand validation. `format` adds `--format` defaulting to table and postprocesses handler results; `requireConfirm` + `--force` gates destructive paths with `enquirer` prompts; `skipConfirmPrompt` bypasses the prompt (used in tests).
- Alias handling happens before parsing: `@app` or `@app.env` is stripped from `argv` in `src/lib/cli/envAlias.ts` (only before `--`) and populates `options.app/options.env`. Using both alias and `--app/--env` exits with an error.
- Global flags injected everywhere: `--help/--version/--debug`. `--debug` enables debug namespaces (`*` when given without a value). Preserve short-option equals normalization and apply parser defaults only when the parsed value is `undefined`; explicit values must win.
- Automatic output formatting requires `_opts.format`. An array is formatted after removing each row's top-level `__typename`; `{header,data}` prints the header as key/value only for non-JSON output, then formats `data`. Returning `undefined` skips automatic printing. Supported command output formats are `table|csv|json`.
- Caveat: `_opts` is shared. Instantiating multiple command runners in one process (tests, composite commands) can leak settings—avoid or refactor.

### Go

- Use the existing `internal/appctx` middleware for app/env lookup, child-environment restrictions, positional validation, confirmations, formatting, and telemetry. Follow a comparable command's composition order; supplying `--app`/`--env` does not replace validation.
- Error-returning handlers use `appctx.Build(...).WithRun(...)`. Renderable handlers return `(any, error)` and must be wrapped with `appctx.WithFormat(...)` before `WithRenderableRun(...)`; the builder alone does not render their data.
- Preserve pre-parse aliases in `internal/envalias`, optional-value parsing in `internal/nodeflags`, and short/long flag compatibility helpers in `cmd/vip-next/commands/nodeflag_aliases.go`. Cobra defaults alone do not reproduce Node.js parsing.
- Use `internal/output` and Cobra's `OutOrStdout()`/`ErrOrStderr()` so output remains testable and machine-readable. Return errors through the existing command/`internal/exit` path; use `exit.Handled(err)` when an error was already printed, rather than losing its non-zero exit status or printing it twice.
- Use `appctx.IsInteractive` for command prompts. `--non-interactive` disables prompting; it does not grant confirmation or permission to perform a destructive action. Progress rendering has a separate stderr/TTY policy and must not contaminate JSON stdout.

## Build, Test, Tooling

- Node.js requires `>=22.19.0` (`package.json#engines.node`); follow `.nvmrc` for development and check `node -v`. Postinstall runs `helpers/check-version.js` and rejects unsupported versions. Node SEA builds have a separate Node 22.x requirement below.
- Babel, not TypeScript, emits `dist`; `babel.config.js` still targets Node 18. That syntax target does not polyfill newer Node APIs or lower the supported runtime minimum. Run `npm run check-types` as well as builds when changing Node.js code, and preserve paths relative to the compiled layout.
- Go requires 1.27 (`go.mod`); the tree uses standard-library `encoding/json/v2`. Do not add the obsolete `GOEXPERIMENT=jsonv2` setting.
- `npm test` runs lint, type-checking, and Jest, excluding dev-env E2E. Use `npm run jest -- --runTestsByPath <test-path>` while iterating; still run relevant lint and type checks before completing code changes.
- For Go, use `make test` and `make lint`; these targets exclude Go source under `node_modules`. Use focused `go test` package paths while iterating.
- For fixture-based parity, rebuild Node.js with `npm run build`, then run `make require-node-vip-bin` and `make test-parity-unit`. The latter builds Go for differential tests and uses `dist/bin/vip.js` by default (`NODE_VIP_BIN` overrides it). Check for skips even when the target succeeds.
- Run `make test-parity-unit-hostile` after changing the parity harness or subprocess environment handling. `make test-parity` builds both runtimes and runs live Parker parity; verify its API, database, and Redis prerequisites before attributing failures to code. Report unavailable checks as unverified.
- Differential tests seed and clean up Node.js credentials for their test API host. Preserve this isolation and inspect credential-related skips; never substitute the user's production credentials.
- Dev-env E2E tests are separate, opt-in checks with host side effects; see the dev-env section before running them. Pure documentation changes need documentation/diff checks, not runtime or parity test execution.

## GraphQL Generation

- Node.js uses `codegen.ts` and a private root-level `schema.gql`. Install codegen tools with `npm run typescript:codegen:install-dependencies`, then run `npm run typescript:codegen:generate`. Do not hand-edit `src/graphqlTypes.d.ts` or `*.generated.d.ts` files.
- Go uses the tracked `internal/gql/schema.gql`, `internal/gql/operations/*.graphql`, and `internal/gql/genqlient.yaml`. Run `make tidy-gql` to regenerate `internal/gql/generated.go` and `make verify-gql-stale` to check it. Do not hand-edit generated Go code or assume the two schema locations are interchangeable.

## Auth & Session Flow

- Node.js bootstraps auth in `src/bin/vip.js` through `Token.get()`. Preserve its help/version/logout, local dev-env, and deploy-token login bypasses; an explicit `login` starts the login flow. Token validity requires an identity and valid issue time, with expiry enforced when present. The stored token is read before bypass checks, so even help can access the credential store.
- Node.js login asks before opening the dashboard token URL, validates and saves the entered token, clears cached elevation, and calls `aliasUser`. Go bootstrap lives in `cmd/vip-next/auth_bootstrap.go`, with login/storage under `internal/auth`. Preserve cancellation, validation errors, and resumption of the original command after login.
- Go auth bypass rules live in `internal/auth/bypass.go`; unlike Node.js, `dev-env sync sql` requires login even without explicit app/env flags. Go's `--non-interactive` makes missing/invalid credentials fail without a login prompt. A login bypass must not discard the stored token needed by downstream API calls.
- Credentials are scoped by API host and runtime: Node.js owns `vip-go-cli`, Go owns `vip-next-cli`. Go may read the legacy Node.js namespace as a best-effort fallback, but must never write or delete it. Go logout uses `Store.LoadPrimary()` so it cannot revoke a borrowed Node.js session. Keep elevated tokens separate from primary credentials and preserve each runtime's cache invalidation hooks.
- `VIP_TOKEN_OVERRIDE` is a Go-only test hatch gated by `GO_ENV=test` or `NODE_ENV=test`; Node.js does not implement it. Use mocked stores or the parity harness's isolated credential setup in tests. Do not use dummy deploy tokens as a general-purpose auth bypass.

## API/GraphQL Layer

- Node.js uses Apollo in `src/lib/api.ts`; Go uses genqlient and the middleware in `internal/gql`, wired in `cmd/vip-next/main.go`. Preserve the error → rechallenge → retry → transport order for authenticated requests, including commands that make raw GraphQL POSTs.
- Node.js GraphQL errors print and exit by default. `exitOnError=false` prevents that GraphQL exit; `disableGlobalGraphQLErrorHandling()` disables global GraphQL handling in tests and must be restored afterward. Neither suppresses the separate HTTP 401 exit: use `silenceAuthErrors=true` or stub the request when testing 401 handling.
- Go's `gql.ErrorConfig` similarly separates `ExitOnError` from `Silence` for 401 handling and accepts an injected `Exit` for tests. `gql.WithAllowGQLErrors(ctx)` bypasses GraphQL print/exit handling for a request, not HTTP 401 handling.
- Ordinary retry middleware retries eligible queries, not mutations; connection-refused, 429, and server-error handling and retry limits live in `src/lib/api.ts` and `internal/gql/retry.go`. Rechallenge is separate: an eligible mutation can be replayed once after successful elevation. Preserve operation-scoped token reuse, expiry checks, redaction, and non-interactive failure behavior in both runtimes.
- Use Node.js HTTP helpers under `src/lib/api` and `src/lib/http`, and Go's `internal/httpproxy` clients/transports. Do not substitute `http.DefaultClient` for authenticated Go requests: its ambient proxy behavior differs. Preserve the explicit direct-client policy for local dev-env health checks.

## Dev-Env Subsystem (High Blast Radius)

- Node.js implementation lives in `src/lib/dev-environment`, uses Lando/Docker, and renders `assets/dev-env.*.ejs`. Go commands live in `cmd/vip-next/commands/devenv*.go`; the engine under `internal/devenv` uses Docker/Compose, lifecycle, proxy, and host-operation adapters rather than Lando.
- Both runtimes store environment state at `xdgData()/vip/dev-environment/<slug>` (`XDG_DATA_HOME` overrides the base). Use the existing Node.js path helpers and Go's `internal/devenv/paths`; preserve existing environments and data during adoption or updates.
- These commands can alter Docker networks/volumes, certificate trust, and hosts entries, and can fetch version metadata. Keep unit tests isolated with fake external adapters, mocked network, and temporary filesystem state; never invoke real Docker or privileged host operations from ordinary unit tests. Scope proxy overrides to the test command rather than changing the user's shell configuration.
- Node.js E2E runs through `npm run test:e2e:dev-env` and requires Docker/Lando. Go E2E requires both the `devenv_e2e` build tag and `VIP_DEVENV_E2E=1`; some tests are macOS-only. Get explicit approval before enabling tests that modify host trust or `/etc/hosts`, and retain the `internal/devenv/e2esafety` clean-state and ownership checks. A gated skip is not a successful E2E run.

## Import/Export/Sync Commands

- Node.js validators live in `src/lib/site-import` and `src/lib/validations`; uploads use `src/lib/client-file-uploader.ts`. Go equivalents include `internal/siteimport`, `internal/sqlvalidation`, `internal/validatefiles`, and `internal/upload`, with export/sync orchestration in `internal/sqlexport` and `internal/sync`. Preserve filename/size checks, multisite detection, API payloads, upload validation, and polling behavior in both runtimes.
- App/env resolution may perform GraphQL requests and prompt before the handler runs. Supply explicit targets in automation and mock network, credential, upload, and telemetry dependencies in unit tests; test-mode environment variables alone do not isolate these paths.
- Confirmation, backup, manifest reload, and error-log download prompts are command-specific. Check each command's supported flags (`--force`, `--skip-confirmation`, `--yes`, or others); there is no universal prompt bypass. Do not remove validation or production safeguards to make a headless run succeed.

## Telemetry, Credentials, and Temporary Data

- Node.js analytics sending is disabled by `DO_NOT_TRACK=1`, not `NODE_ENV=test`; tracker initialization can still access/create the credential-backed analytics UUID, so mock it in unit tests. Node's update notifier is suppressed by `NODE_ENV=test` or `VIP_CLI_SEA_MODE=1`. Go telemetry is disabled by `DO_NOT_TRACK` or `GO_ENV=test`/`NODE_ENV=test`.
- Node.js normally stores tokens/UUIDs in the OS keychain, falling back to Configstore when unavailable. Go uses the OS keyring, with a headless-Linux fallback to `credentials.json` under `os.UserConfigDir()/vip` (mode 0600). Do not print credentials, merge runtime namespaces, or broadly delete stores/caches to debug state; identify the exact entry and obtain approval before deleting user data.
- Node.js `makeTempDir()` registers cleanup on process exit; Go callers use explicit/deferred cleanup for temporary files. Abrupt termination can leave artifacts, and process exits can bypass Go defers. Use isolated test directories and only clean up artifacts owned by the current operation.

## Release & Packaging

- **Node.js npm:** `prepare` runs `npm run clean && npm run build`; package bins point to `dist`. `helpers/prepublishOnly.js` requires `trunk` for the `latest` tag, checks the supported Node version, and runs tests outside CI. Rebuild before publishing.
- **Node.js SEA:** use `docs/SEA-BUILD-SIGNING.md` and `helpers/build-sea.js`. `npm run build:sea` requires Node 22.x, embeds the Node runtime, and relies on the internal-bin registry for dispatch. This is separate from the Go executable.
- **Go:** use `make build` and `docs/BUILD-SIGNING.md` for `bin/vip-next`, version stamping, cross-compilation, and platform-specific signing. Go builds use `CGO_ENABLED=0`; they do not embed Node.js. Check the current `.buildkite/build-*` scripts when changing packaging.
- Go search-replace bundling prefers verified binaries under `third_party/go-search-replace`, then fixtures under `__fixtures__/search-replace-binaries`; `make build` fails if none is available unless an explicit override is supplied. `make vendor-search-replace` verifies the pinned manifest checksums. Preserve bundling/signing of this companion executable; a successful Go compile alone does not prove the distributable is complete.
- Standalone packaging does not eliminate host Docker/Compose requirements for dev-env. Publishing, deploying, or enabling remote changes requires explicit user approval; building/testing locally does not authorize release actions.
