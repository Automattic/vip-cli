# AGENTS: vip-cli

Guide for future agents working on this codebase. Focus on traps, cross-cutting constraints, and how to avoid breaking prod while refactoring or migrating the CLI parser.

## Repo Orientation
- Entrypoints live in `src/bin` (one file per CLI command) and are compiled to `dist/**`. Do not edit `dist`; rebuild via `npm run build` before publishing.
- Shared logic sits under `src/lib`; GraphQL command wrappers in `src/commands`; fixtures/tests in `__fixtures__` and `__tests__` (E2E lives in `__tests__/devenv-e2e`).
- Config required at runtime: `config/config.publish.json` (or `config.local.json` in dev). Missing files cause a hard exit.
- Babel (not tsc) performs builds; target is Node 18 in `babel.config.js` even though `package.json#engines.node` is 20+. Be cautious using very new Node APIs unless polyfilled.

## Command Anatomy (current Commander compatibility layer)
- Every bin uses `command()` from `src/lib/cli/command.js`. It wraps `commander` and keeps the legacy handler contract while preserving app/env context resolution, confirmations, telemetry, and output formatting.
- Call shape: `command(opts).option(...).command(...sub...).example(...).argv(process.argv, handler)`. `handler` receives `(subArgsArray, optionsObject)` where `subArgsArray` are positional args (alias removed) and `optionsObject` holds flags plus resolved `app`/`env` when requested.
- `_opts` knobs: `appContext`/`envContext`/`childEnvContext` run GraphQL lookups (using `appQuery` + optional fragments) and interactive prompts when `--app/--env` are missing; `childEnvContext` forbids production. `requiredArgs` enforces positional count; `wildcardCommand` disables subcommand validation. `format` adds `--format` defaulting to table and postprocesses handler results; `requireConfirm` + `--force` gates destructive paths with `enquirer` prompts; `skipConfirmPrompt` bypasses the prompt (used in tests).
- Alias handling happens before parsing: `@app` or `@app.env` is stripped from `argv` in `envAlias.ts` (only before `--`) and populates `options.app/options.env`. Using both alias and `--app/--env` exits with an error.
- Global flags injected everywhere: `--help/--version/--debug`. `--debug` enables `debug` namespaces (`*` when boolean). `update-notifier` runs after validation unless `NODE_ENV=test`.
- Short-flag parity detail: if an option has no explicit short alias, the wrapper can auto-assign one from the first long-option character (for `args` compatibility), except reserved globals (`h`, `v`, `d`) and already-used short names.
- Nested subcommands are dispatched by the wrapper to sibling bin scripts (`vip-config` -> `vip-config-envvar` -> `vip-config-envvar-set`) using local `dist/bin` paths when available.
- Output contract: if handler returns `{header,data}` it prints header as key/value then formats `data`; if it returns an array it strips `__typename` and formats; returning `undefined` skips printing. Formatting uses `formatData` with `table|csv|json`.
- Caveat: `_opts` is shared. Instantiating multiple command runners in one process (tests, composite commands) can leak settings—avoid or refactor.

## Build, Test, Tooling
- `npm test` runs lint + type-check + jest; slow. Use `npm run jest` to skip lint/tsc when iterating. `NODE_ENV=test` also suppresses the update-notifier network call in `src/lib/cli/command.js`.
- E2E dev-env tests (`npm run test:e2e:dev-env`) require Docker + Lando and will mutate the host; they are excluded from the default test script.
- GraphQL types are generated from a private `schema.gql` (`codegen.ts`). To regenerate you need that schema plus `npm run typescript:codegen:*`; do not hand-edit `src/graphqlTypes.d.ts` or `*.generated.d.ts` files.
- go-search-replace binaries are needed for some runtime paths and tests; fixtures live in `__fixtures__/search-replace-binaries`. Without them certain commands/tests will fail silently or skip.
- Postinstall runs `helpers/check-version.js` and will exit if Node is outside the engine range; keep the local version aligned.

## CLI Architecture
- Root executable is `src/bin/vip.js`. It triggers login unless one of: `--help/-h`, `--version/-v`, `logout`, `dev-env` without env args, or `WPVIP_DEPLOY_TOKEN` is set for deploy. Automation that lacks a token should pass `--help` or set `WPVIP_DEPLOY_TOKEN` to avoid interactive prompts that call `open`.
- Command wiring happens through `src/lib/cli/command.js`, a `commander`-backed compatibility wrapper with custom validation and telemetry. Options in `_opts` control behavior:
  - `appContext`/`envContext`/`childEnvContext` prompt or validate app/env via GraphQL (uses `appQuery` + optional fragments). Child env forbids production.
  - `requiredArgs` forces positional arg count; `wildcardCommand` relaxes subcommand validation; `format` auto-adds `--format` and postformats output.
  - `requireConfirm` + `--force` gate destructive actions with `enquirer` confirmations; tests should set `skipConfirmPrompt` or pass `--force`.
- Environment aliases like `@app.env` are parsed in `src/lib/cli/envAlias.ts`; aliases are stripped from argv and populate `--app/--env`. Using both alias and explicit flags is rejected.
- Subcommand chaining now happens in the wrapper itself (instead of `args`), so behavior changes here impact the entire CLI tree.

## Auth & Session Flow
- Auth is centralized in `src/bin/vip.js`. It loads a JWT from keychain (`Token.get()`), checks `id/iat/exp`, and considers the CLI “logged in” when valid. A missing/invalid token triggers an interactive login unless the argv contains help/version/logout, a `dev-env` call without env, or a deploy using `WPVIP_DEPLOY_TOKEN`.
- Login flow: prints banner, opens `https://dashboard.wpvip.com/me/cli/token` via `open`, prompts for token with `enquirer`, decodes and validates JWT, stores it (`Token.set()`), de-anonymizes analytics via `aliasUser`, then re-enters command dispatch. Errors (expired/malformed) exit with guidance and telemetry events.
- Token storage is per-`API_HOST`: service name changes with host, so switching to staging/local uses a different stored token.
- Downstream commands assume valid auth. The Apollo client exits on 401 unless constructed with `silenceAuthErrors`/`exitOnError=false`.

## API/GraphQL Layer
- `src/lib/api.ts` builds an Apollo client with `ErrorLink` that prints GraphQL errors and calls `process.exit(1)` by default. Use `disableGlobalGraphQLErrorHandling()` in tests to keep errors throwable.
- Retry logic only retries queries (not mutations) and stops after 5 attempts; ECONNREFUSED triggers retry, 4xx (except 429) does not. Be careful when wrapping mutations—errors will not retry.
- On 401, the client prints a custom message and exits; ensure authenticated tests stub the network or set `silenceAuthErrors`/`exitOnError=false` when constructing the client.

## Dev-Env Subsystem (High Blast Radius)
- Implemented under `src/lib/dev-environment/**`; shells out to Lando and Docker, renders templates from `assets/dev-env.*.ejs`, and writes to per-environment folders inside `xdgData()/vip` (overridden by `XDG_DATA_HOME`). Running these commands mutates local docker networks and may fetch WP/PHP version metadata from GitHub constants.
- Proxy helpers live in `src/lib/http/proxy-*`; dev-env code constructs agents automatically using `VIP_PROXY`/`SOCKS_PROXY`/`HTTP_PROXY`/`VIP_USE_SYSTEM_PROXY`. Unexpected proxies can break downloads—clear those env vars when debugging.
- Avoid invoking dev-env logic in unit tests unless you mock `lando`, filesystem, and network; the E2E suite covers the real paths.
- Runtime resilience safeguards:
  - `startEnvironment()` performs bounded readiness checks after start/rebuild and attempts one recovery `landoStart` pass if status remains down.
  - `vip-dev-env-exec` performs bounded readiness polling before failing with "running environment required", reducing false negatives under heavy Docker/Lando load.

## Import/Export/Sync Commands (high validation)
- Heavy validators live in `src/lib/site-import/**` and `src/lib/validations/**`. `vip import sql` enforces file name rules, extension checks, size caps (`SQL_IMPORT_FILE_SIZE_LIMIT*`), and detects multisite; it may upload to S3 via `src/lib/client-file-uploader.ts` (expects readable file or URL and optional MD5). These paths also emit analytics; use `NODE_ENV=test` and stubs to avoid network.
- Sync/backup/snapshot commands rely on GraphQL fields like `syncPreview` and environment metadata; `command.js` will prompt for app/env selection via GraphQL if not provided.
- These commands stack multiple prompts (confirm, reload manifest, error-log download); in headless runs pass `--force` and other flags to skip interaction.

## Data Paths & Temp Files
- Temporary working dirs are created with `makeTempDir()` and cleaned up on normal exit only. Crashes may leave artifacts under the system tmp folder.
- Persistent data (tokens, analytics UUID, dev-env state, caches) lands in Configstore or under `xdgData()`; clean those if you hit unexplained state issues.

## Release & Packaging
- `prepare` runs `npm run clean && npm run build`; npm package bins point to `dist/**`. Always rebuild before publishing so dist matches src.
- `helpers/prepublishOnly.js` enforces branch `trunk` for `npm publish --tag latest` and optionally reruns `npm test`. Release flows expect a clean node version that satisfies `engines.node`.

## Standalone SEA Packaging
- Canonical runbook for standalone executable build/signing is in `docs/SEA-BUILD-SIGNING.md`. Use it for macOS, Linux, Windows native, and WSL-mediated Windows builds.
- SEA builds are Node 22 only (enforced in `helpers/build-sea.js`); always verify `node -v` before `npm run build:sea`.
- The executable is self-contained for Node runtime + JS deps, but `dev-env` commands still require host Docker/Compose availability.

## Common Pitfalls Checklist
- Running CLI without a token opens a browser (`open`) and waits for interactive input—pass `--help` or set `WPVIP_DEPLOY_TOKEN` in automation.
- Forgetting `--app/--env` or alias when a command expects them triggers extra GraphQL lookups and prompts; in headless contexts set `_opts.appContext=false` or supply explicit flags.
- Analytics + update-notifier will reach the public internet unless `DO_NOT_TRACK=1` and `NODE_ENV=test` are set.
- Babel pathing relies on relative `__dirname` from transpiled files; when moving files adjust import paths with the compiled layout in mind.
- TypeScript is type-checked separately from the build; Babel will happily emit code that fails `tsc`, so keep `npm run check-types` in the loop during refactors.

## Commander Migration Status
- Core parser migration is active in `src/lib/cli/command.js`; command bins using this wrapper run on Commander semantics.
- High-risk parity points still worth verifying during further cleanup: help text formatting parity, boolean option edge cases, and deeply nested subcommand/alias combinations.
- Keep alias stripping behavior (`parseEnvAliasFromArgv`), `_opts` contracts, and telemetry hooks stable while iterating.
