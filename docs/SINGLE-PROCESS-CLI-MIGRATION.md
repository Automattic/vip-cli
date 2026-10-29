# Single-entrypoint Node.js CLI migration

## Scope

The npm package exposes one executable, `vip`, from `src/bin/vip.ts`, compiled
to `dist/bin/vip.js`. All 77 command implementations live as checked TypeScript
modules under `src/commands/vip-*.ts`; their generated GraphQL declarations move
with them without content changes.

The former standalone executables such as `vip-app-list` are removed. Invoke
their canonical command forms, such as `vip app list`, instead. The canonical
command names, flags, positional arguments, help, and safety checks remain.

## Implementation plan

1. Bind options to each parser instance so child registration cannot overwrite
   a parent's middleware configuration.
2. Default-export each command's execution promise and await it during lazy,
   in-process dispatch. Preserve the root authentication bootstrap and the
   dev-env root guard.
3. Move command implementations out of `src/bin` and convert JavaScript modules
   to strict TypeScript, including typed parsed options, API responses, and
   errors. Correct shared type declarations to match existing runtime inputs;
   preserve null/false defaults and request payloads.
4. Expose only `vip` in the package and lockfile bin maps. Have the root resolve
   its children from `dist/commands`, independent of sibling executable files.
   Nested commands resolve their children from that same module directory.
5. Preserve alias, option, and `--` forwarding. Supply the selected module's
   argv while it runs, then restore its caller's argv. Report missing packaged
   modules through the existing error handler rather than executing from PATH.
6. Update imports, process helpers, release checks, and command smoke checks to
   use the sole entrypoint. Build from a clean output directory so obsolete
   compiled bin files cannot hide a missing migration.
7. Run Node.js lint, type checking, tests, and built-command checks. Run Go tests
   only when Go production code changes. Keep live Docker and host-modifying
   E2E checks separate.

## Runtime and packaging checks

`npm run smoke:single-process` traverses the built command registrations and
checks every command's help through `vip`. It verifies the one-bin package and
lockfile maps, the absence of extra files in `dist/bin`, and coverage of all
internal command modules. It also checks an npm-style `vip` symlink, nested
asynchronous execution, exact argv forwarding, exit status, lazy loading, and
the root safeguard. These tests mock credentials and reject routing
subprocesses; they do not exercise real development environments.

`npm run smoke:release` exercises parser edge cases through `vip`, including
short-option equals, the WP separator boundary, and nested dev-env commands.
Development-environment E2E helpers also construct canonical `vip dev-env …`
invocations, without running those gated tests during this migration.

The forwarding checks exposed an existing alias bug: `@literal` after `--` was
copied into the CLI options before the separator. Alias forwarding now considers
only the part before `--`. A focused real Node-vs-Go differential check passed
for that boundary; no Go production code changed, and full Go parity was not
completed.

## Validation (2026-10-29)

- Clean output followed by `npm run build`: passed on Node.js v24.19.0.
- `npm test`: lint and type checking passed; all 100 suites and 1,049 tests
  passed, with one existing todo and one existing lint warning.
- `npm run smoke:single-process`: all 82 checks passed, with no skips.
- `npm run smoke:release`: all 14 checks passed.
- Source and built bin directories each contain only the `vip` entrypoint;
  package and lockfile bin maps agree. Generated GraphQL declarations retain
  their original contents after relocation.
- Go tests and live development-environment E2E checks were not rerun for this
  follow-up.

## Startup measurement

During the in-process dispatch migration, `vip config envvar list --help`
improved from 1.98 s to 0.70 s median startup time (about 65% lower). The comparison
used five timed runs after a warmup, the same Node.js v24.19.0 and dependencies,
mocked credentials, disabled telemetry, and a temporary build containing the
original dispatcher. Individual samples varied with host load. This measures
startup overhead rather than Lando bootstrap or environment health checks.
