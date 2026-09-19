# Commander Migration Status

Goal: remove the abandoned `args` package and keep CLI behavior stable. See `AGENTS.md` for broader architecture traps.

## Migration Outcome

- `src/lib/cli/command.js` is the active Commander-backed compatibility wrapper for all bins that call `command()`.
- `args` has been removed from `package.json` and `npm-shrinkwrap.json`.
- Root command flow (`src/bin/vip.js`) now dispatches via the shared Commander wrapper again, preserving login gating and subcommand chaining.
- Temporary side-path wrapper work has been removed (`src/lib/cli/command-commander.ts` deleted).

## Compatibility Behaviors Preserved

- Legacy command contract stays the same: `command(opts).option(...).argv(process.argv, handler)`.
- Alias behavior remains pre-parse: `@app` and `@app.env` are stripped before `--`; alias + `--app/--env` still errors.
- `_opts` controls are still honored: app/env context fetch, confirmation gating, output formatting, wildcard command handling, required positional args.
- Shared formatting/output and telemetry hooks are still in the wrapper path.
- Local nested subcommand dispatch still works via sibling executable resolution.

## Post-Migration Hardening

- Short-flag compatibility was restored for long options without explicit aliases:
  - Example: `--elasticsearch` accepts `-e`, `--phpmyadmin` accepts `-p`, etc.
  - Auto-short generation skips reserved global flags (`-h`, `-v`, `-d`) and avoids duplicate collisions.
- `vip dev-env exec` now performs bounded readiness checks before deciding an environment is not running.
- `startEnvironment()` now includes bounded post-start readiness checks and one recovery `landoStart` retry if the environment stays `DOWN` after rebuild/start.

## Remaining Technical Debt

- `_opts` is still module-level state in `src/lib/cli/command.js` and can leak between command instances in one process.
- Help text parity against historical `args` output is close but still a verification target for high-traffic commands.
- Full dev-env E2E can still show Docker/Lando infrastructure flakiness (network cleanup and startup latency), which is environment-level, not parser-level.

## Verification Commands

- `npm run build`
- `npm run check-types`
- `npm run test:e2e:dev-env -- --runInBand __tests__/devenv-e2e/001-create.spec.js __tests__/devenv-e2e/005-update.spec.js`
- `npm run test:e2e:dev-env -- --runInBand __tests__/devenv-e2e/008-exec.spec.js __tests__/devenv-e2e/010-import-sql.spec.js`

## Next Refactor Steps

1. Remove global `_opts` state from `src/lib/cli/command.js` by moving to per-instance configuration.
2. Add parser contract tests for aliasing, wildcard behavior, and short/long boolean coercion.
3. Add stable startup/readiness integration checks around dev-env commands in CI environments with Docker.
