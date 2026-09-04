# vip-next cutover: breaking changes

Customer-visible differences between the Node `vip` CLI and the Go `vip-next` rewrite.
**This file is the source for the cutover changelog and migration notes.** Nothing here is
optional to communicate — every entry changes behavior for someone with an existing script.

Source: the 2026-07-24 adversarial parity review
(`docs/superpowers/notes/2026-07-24-node-go-parity-review.md`, untracked scratch), as amended by
the remediation of the same date (commits `a4d33633`..`1545094c`).

> **Baseline correction — read before trusting any pre-remediation entry.** The review was
> conducted against this repo's _vendored_ `src/`, which was (a) frozen at 4.0.4 while upstream
> reached 4.1.0, and (b) **hand-edited**: four lines implementing `VIP_TOKEN_OVERRIDE` had been
> injected into `src/lib/token.ts`, plus five matching references in `__tests__/lib/token.js`.
> That variable has never existed in `Automattic/vip` (`git log --all -S` → zero commits). All
> vendored trees are now byte-identical to upstream `trunk`, and
> `TestVendoredNodeSourceHasNoCredentialEscapeHatch` guards against a recurrence. Nine review
> findings have been retired as non-issues; item 2.15 was void and has been deleted.

Status legend: `KEEP` = intentional divergence, ship it and document it ·
`FIX` = regression, must land before cutover · `DONE` = fixed, still needs a changelog line.

---

## 1. Intentional divergences — KEEP and announce

Go is stricter or more correct than Node here. We are deliberately not carrying the Node
behavior forward, but each one can break an existing script, so each needs a changelog line.

| #    | Change                                                         | Node behavior                                                                                                                                         | vip-next behavior                                                                                                            | Who breaks                                                                                                                                                                                                 |
| ---- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | Missing required positional                                    | prints help, **exit 0**                                                                                                                               | error, **exit 1**                                                                                                            | `set -e` wrappers that tolerated a usage mistake                                                                                                                                                           |
| 1.2  | Unknown `--format` value                                       | silently renders a table, exit 0                                                                                                                      | `Invalid format: X`, exit 1                                                                                                  | scripts passing a typo'd/templated format                                                                                                                                                                  |
| 1.3  | `--format ids`                                                 | works (space-joined ids)                                                                                                                              | rejected on platform commands                                                                                                | `for id in $(vip app list --format ids)`                                                                                                                                                                   |
| 1.4  | `--flag=false` on optional-value flags                         | the string `"false"` is truthy, so `--force=false` **skips** the prompt                                                                               | real boolean, `--force=false` **prompts**                                                                                    | CI templating `--force=${VAR}`                                                                                                                                                                             |
| 1.5  | `dev-env destroy`                                              | no confirmation at all                                                                                                                                | prompts unless `--yes`                                                                                                       | non-interactive teardown scripts                                                                                                                                                                           |
| 1.6  | `dev-env purge` in non-TTY                                     | auto-confirms                                                                                                                                         | refuses without `--yes`/`--force`                                                                                            | same                                                                                                                                                                                                       |
| 1.7  | `vip wp` without `--`                                          | hard error                                                                                                                                            | accepted                                                                                                                     | nobody; we lose a helpful diagnostic                                                                                                                                                                       |
| 1.8  | Remote stderr on `vip wp` (SSH)                                | silently dropped                                                                                                                                      | forwarded to stderr                                                                                                          | anyone redirecting stdout only                                                                                                                                                                             |
| 1.9  | `app deploy validate` on `.ZIP`                                | fails (extension compared case-sensitively)                                                                                                           | passes                                                                                                                       | someone who "fixed" a failure by renaming                                                                                                                                                                  |
| 1.10 | Error output                                                   | adds a second space after `Error:`, always writes a runtime `Debug:` line to **stdout**, and may dump the stack when debug namespaces are enabled     | one-space `Error:` message on stderr, no runtime banner or stack on stdout                                                   | anyone parsing stdout on failure — note this _fixes_ corrupt `--format json` output                                                                                                                        |
| 1.11 | 401 message                                                    | `Unauthorized: undefined; …`                                                                                                                          | correct default message                                                                                                      | —                                                                                                                                                                                                          |
| 1.12 | `export sql --site-id=2,3`                                     | `parseInt` → site 2 only (contradicts Node's own docs)                                                                                                | sites 2 and 3                                                                                                                | anyone relying on the buggy narrow export                                                                                                                                                                  |
| 1.13 | `validate-files` on intermediate images                        | TypeError → exit 1, no summary                                                                                                                        | clean summary, exit 0                                                                                                        | CI gating on exit status                                                                                                                                                                                   |
| 1.14 | `import media --overwriteExistingFiles=false` with `--force`   | sends truthy string `"false"`                                                                                                                         | real boolean                                                                                                                 | —                                                                                                                                                                                                          |
| 1.15 | `vip logout` when `POST /logout` fails                         | unhandled rejection, **exit 1**                                                                                                                       | best-effort revoke, local token always cleared, **exit 0**                                                                   | a script asserting logout confirmed server-side revocation                                                                                                                                                 |
| 1.16 | `dev-env import sql` validation severity                       | hard-fails on **every** finding                                                                                                                       | tiered: platform-policy checks warn and proceed                                                                              | scripts relying on a non-zero exit for e.g. `ENGINE != InnoDB`                                                                                                                                             |
| 1.17 | `dev-env import sql` siteurl check                             | warns and imports anyway                                                                                                                              | **blocks** (exit 1)                                                                                                          | importing production SQL with no `--search-replace`                                                                                                                                                        |
| 1.18 | Non-interactive `--in-place` search-replace                    | no non-TTY handling at all                                                                                                                            | hard error, exit 1                                                                                                           | CI relying on a silent rewrite                                                                                                                                                                             |
| 1.19 | `dev-env import sql --quiet`                                   | prints the validation report regardless                                                                                                               | suppresses the report (warnings/fatals never suppressed)                                                                     | log scrapers                                                                                                                                                                                               |
| 1.20 | `import media` report download                                 | plain `fetch`, ignores proxy env                                                                                                                      | honors `VIP_PROXY`/`VIP_USE_SYSTEM_PROXY`                                                                                    | only users who opted in; Node cannot download it at all on a SOCKS-only network                                                                                                                            |
| 1.21 | `vip config envvar get login`                                  | `isLoginCommand` inverts the bypass and re-runs login even with a valid token                                                                         | runs normally                                                                                                                | anyone depending on that Node defect                                                                                                                                                                       |
| 1.22 | `import sql` progress ticker on a non-TTY                      | emits raw cursor escapes with no newlines                                                                                                             | silent                                                                                                                       | log scrapers                                                                                                                                                                                               |
| 1.23 | `import sql --search-replace` **with `--in-place`**            | applies the pairs **twice** — the rewritten file is uploaded _and_ the pairs are sent to the server (`vip-import-sql.js:760` is not gated on `isUrl`) | applied once                                                                                                                 | anyone whose replacement is non-idempotent, e.g. `a,aa` turned "a" into "aaaa". A domain swap hides the bug, which is why it survived. URL imports and local imports _without_ `--in-place` are unchanged. |
| 1.24 | Required prompt in a non-TTY                                   | enquirer emits a raw ANSI prompt; its unresolved promise drains and the process exits 0 without mutating                                              | explicitly reports that prompting is unavailable, prints the command-specific cancellation message, exits 0 without mutating | scripts snapshotting prompt output; mutation safety is unchanged                                                                                                                                           |
| 1.25 | `import validate-sql` line count for a newline-terminated file | counts one phantom trailing line                                                                                                                      | reports the physical line count                                                                                              | scripts parsing `Finished processing N lines.`                                                                                                                                                             |
| 1.26 | `db phpmyadmin --print` streams                                | progress tracker and warning go to stdout before the URL                                                                                              | stdout contains only the URL; warning/progress go to stderr                                                                  | command substitution or parsers that previously received progress text with the URL                                                                                                                        |
| 1.27 | Interactive login banner                                       | legacy uncolored `VIP-CLI` ASCII art                                                                                                                  | six-line `VIP-CLI 5` ANSI Shadow artwork in the VIP warm-color gradient                                                      | snapshot tests or tools scraping the login prompt                                                                                                                                                          |
| 1.28 | Edge Workers help examples and init/new next steps             | invoke `vip`                                                                                                                                          | invoke `vip-next`                                                                                                            | users copying Go guidance now stay in the Go runtime; shared project templates are unchanged                                                                                                               |

**Decided exception — do NOT keep:** `config software update` rejecting _deprecated_ versions.
Node accepts them; deprecated versions are exactly what you reach for during an incident
rollback. Fixed — see 2.9.

---

## 2. Regressions — FIX before cutover

**All 22 original items are resolved.** Each still needs a changelog line.

| #        | Issue                                                                                                                               | Impact                                                               | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1      | dev-env `-p n` / `--xdebug n` / … **enabled** the service (cobra bools vs Node's `y`/`n` value flags); stray `n` silently swallowed | every documented "disable" invocation did the opposite               | DONE `61ae9141`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2.2      | `--media-redirect-domain n` stored the literal domain `"n"`                                                                         | media proxy pointed at a garbage host                                | DONE `61ae9141`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2.3      | `search-replace --in-place` had no confirmation, and truncated the target before the child result was known                         | **irreversible rewrite; a rejected pair left a 0-byte file**         | DONE `d8081940`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2.4      | `dev-env import sql --in-place` — same missing confirmation                                                                         | same                                                                 | DONE `d8081940`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2.5      | `dev-env start` overwrote `<envdir>/.env`                                                                                           | **destroyed all env vars set by the Node CLI**                       | DONE `d8081940` — `.env` is now the shared source of truth for both CLIs                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2.6      | Short flags absent outside dev-env                                                                                                  | parse-time failure for most existing scripts                         | DONE `61ae9141` — restored across ~24 commands                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2.7      | `--force` renamed to `--skip-confirmation`                                                                                          | headless invocations failed                                          | DONE `61ae9141` — `--force` restored as an alias                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2.8      | `--version` root-only; `-d` / `--debug=ns1,ns2` rejected                                                                            | version probes and the documented support-debug flow failed          | DONE `61ae9141`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2.9      | `config software update` rejected deprecated versions                                                                               | blocked incident rollback                                            | DONE `5a4a7dac`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2.10     | `IsInteractive()` sensed stdout, not stdin                                                                                          | `vip sync \| tee` cancelled and **exited 0** without mutating        | DONE `d8081940` — also fixed a second copy in `rechallenge`                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2.11     | Confirmation prompts showed no App/Environment/target detail                                                                        | users authorized destructive actions blind                           | DONE `48068fff`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2.12     | `sync` skipped Node's `syncPreview.canSync` pre-flight                                                                              | fired a destructive mutation Node refuses                            | DONE `48068fff`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2.13     | `ShouldBypassAuth` scanned the whole argv                                                                                           | `wp help …`, `wp <cmd> --help`, an env var named `help` all failed   | DONE `76af73db` — root cause was conflating "skip login" with "skip API setup"; Node's scan is equally flat                                                                                                                                                                                                                                                                                                                                                                 |
| 2.14     | No `VIP_PROXY`/`SOCKS_PROXY`; `HTTPS_PROXY` honored without opt-in                                                                  | enterprise users broke; bearer token routed through a declined proxy | DONE `981314cf` + `5d8fe09f`                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ~~2.15~~ | ~~`VIP_TOKEN_OVERRIDE` honored outside `NODE_ENV=test`~~                                                                            | —                                                                    | **DELETED — VOID.** The variable never existed in Node; it had been hand-injected into the vendored `src/`. This compared Go against fabricated behavior. `33790a72` gated Go's override on `GO_ENV`/`NODE_ENV=test` and was described as parity; it is not, and the gate is retained purely as a Go-only hardening decision (a test hatch should not be a live production auth path). 83 parity scenarios plus `test-parity-unit-hostile` depend on the variable existing. |
| 2.16     | `backup db` / `export sql` polling unbounded                                                                                        | hung forever in CI                                                   | DONE `b75e8d82` — 6h `pollUntil` ported; `db phpmyadmin`'s inverse 60s cap also fixed                                                                                                                                                                                                                                                                                                                                                                                       |
| 2.17     | 16 MB per-line scanner cap in SQL validation                                                                                        | rejected large dumps Node imports fine                               | DONE `5a4a7dac`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2.18     | `export sql --config-file` dropped unknown keys, hard-failed on boolean per-table options                                           | **exported the wrong data scope, exit 0**                            | DONE `b75e8d82` — Node has no runtime schema at all                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2.19     | `slowlogs --limit` capped at 500                                                                                                    | large log pulls failed                                               | DONE `5a4a7dac` — real ceiling is 5000; Node's own help says 500 and its error says 5000                                                                                                                                                                                                                                                                                                                                                                                    |
| 2.20     | dev-env import/sync skipped Node's post-import steps                                                                                | **user locked out of their own local wp-admin**                      | DONE `888051ca`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2.21     | `.wpvip/vip-dev-env.yml` unimplemented                                                                                              | `destroy`/`purge` could target the wrong environment                 | DONE `888051ca`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2.22     | `dev-env create --start` defaulted true and escalated to `sudo`                                                                     | CI scripts hung on a sudo prompt                                     | DONE `888051ca` — default now false; the flag itself is unchanged                                                                                                                                                                                                                                                                                                                                                                                                           |

### Also fixed, not in the original list

| Issue                                                                                                                                                                                               | Impact                                                       | Status          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------- |
| `import media` report-download failure leaked the **presigned URL** (its query string is the credential) into the error, which the `cli_error` telemetry hook shipped to `public-api.wordpress.com` | live credential sent off-box on every failed report download | DONE `5d8fe09f` |
| Pendo telemetry endpoint hardcoded to production while `API_HOST` was read on the adjacent line                                                                                                     | staging/local runs emitted into the production pipeline      | DONE `5d8fe09f` |
| `--non-interactive` did not make step-up fail fast — it polled to session expiry                                                                                                                    | hung in CI; the catalog claimed the opposite                 | DONE `8a7ba911` |
| Four exit paths returned 0 where Node returns 1 (`config software update` declined / nil job progress, `dev-env envvar delete` on a missing var, `dev-env purge` on removal failure)                | CI reported green on a no-op                                 | DONE `44ece063` |
| `dev-env import sql` ran **no** SQL validation at all; `--skip-validate` was a documented no-op                                                                                                     | a dump Node rejects imported clean, exit 0                   | DONE `c6defbd0` |

---

## 3. Removed or renamed CLI surface

Announce these explicitly; they fail at parse time, not at runtime.

- `--format keyValue` output reshaped: Node emits a `===` banner + `+ key: value`; vip-next emits `key=value`
- `vip logs --format csv|json` no longer emits a leading `__typename` column/key (column indices shift by one)
- `vip logs` table headers are lowercase (`timestamp`/`message`) where Node capitalizes
- `--version` output format: Node prints `4.1.0`; vip-next prints `vip-next <ver> (commit <sha>)`
- `--help` is rendered by Cobra rather than commander: usage and option layout differ, and
  Node's appended `Examples` block is not reproduced
- `vip wp` supports only the `@app.env` alias — explicit `--app`/`--env` are ignored (known WP1 limitation)
- No update-notifier: vip-next ships as a signed binary, so there is no in-CLI update channel

**Restored during remediation — no longer breaking, remove from migration notes:**
`--xdebug_config` (underscore form is canonical again), `dev-env start --vscode`,
`dev-env info --extended`.

---

## 4. New in vip-next (no Node equivalent)

Reverting to the Node CLI after using these fails loudly (`unknown option`), not silently.

- `vip completion bash|zsh|fish|powershell`, `vip help`
- Global `--non-interactive`
- `slowlogs --follow` — **note:** `src/bin/vip-slowlogs.ts` defines `followLogs()` and reads `opt.follow` but never registers the option, so Node rejects it. This is Go-only surface, not parity.
- `dev-env sync sql --search-replace`, `dev-env create --domain`/`--start`
- `VIP_RECHALLENGE_WAIT=1` / `--rechallenge-wait` — prints the step-up URL and waits, for non-interactive contexts that can complete a challenge out of band

**`vip defensive-mode enable|disable|configure` is NOT Go-only.** The review claimed it was;
upstream `trunk` has `src/lib/rechallenge/`, `src/lib/defensive-mode/` and four
`vip-defensive-mode-*` bins. Any "no Node counterpart" reasoning about this subsystem should be
re-checked against trunk.

**Accepted risk, documented not fixed:** step-up approvals are cached by GraphQL field name
only (`internal/rechallenge/rechallenge.go`), so one "enable WAF on app A production" approval
covers `disable` on app B production until expiry; `CreateSession` sends no app/env, so the
server cannot bind it either. Now that a Node counterpart is known to exist, whether Node binds
app/env is directly checkable and this decision is worth revisiting.

**Cutover risk worth flagging to stakeholders:** the rechallenge/step-up middleware fires on
_any_ mutation whose response carries `elevated-permission-required`. The moment the API enables
step-up for a mutation Node users need, the Node CLI has no handler and hard-fails — meaning the
ability to revert leaves on the server's schedule, not ours.

---

## 4b. Differential expansion — RESOLVED

Extending the real Node↔Go differential from 32 to 60 of 85 scenarios (`68007c85`) surfaced
**18 red scenarios** that the former Go-only mock tests could not detect. They are now triaged,
implemented and recorded; `make test-parity-unit` is green.

Fixed toward Node compatibility:

- `backup db` keeps progress and success on stdout (including TTY runs), flushes its final
  progress frame before the success message, and adds no extra blank line between them.
- `import validate-sql` no longer invents clean/multisite summary lines, and failure findings
  now travel through the stderr error path while the line-count header remains on stdout.
- `config envvar set` and `config envvar delete` preserve Node's stdout validation message and
  exit 1 without duplicating the same message through the shared stderr renderer.
- `import validate-sql` findings emit Node's failure telemetry with its per-check summary rather
  than incorrectly emitting a success event.
- phpMyAdmin enable failures map to Node's stable permission/support messages instead of raw
  GraphQL errors; URL-generation failures retain their separate actionable prefix.

Kept deliberately and moved into the cutover register: clean error rendering (1.10), explicit
non-TTY cancellation (1.24), correct SQL line counts (1.25), URL-only phpMyAdmin `--print`
stdout (1.26), and Cobra help rendering (§3).

There are now 22 accepted differential scenarios in total: the 15 remaining from this pass
plus seven pre-existing decisions. Every `expected_drift` records both a reason and a SHA-256
fingerprint of the normalized Node/Go exit code, stdout and stderr. A changed fingerprint or a
stale annotation makes the parity suite red, so an accepted difference cannot mask unrelated
future output drift.

### Still Go-only-tested (25 of 85)

Not convertible without new harness machinery, each with a specific reason recorded in
`internal/parity/surface_differential_test.go`: Node's status poll reuses the `App`
operationName (needs variable-shape routing); Node repaints progress every 200 ms with no
non-TTY guard (non-deterministic); call-count-indexed fixtures hand the two CLIs different
worlds; `sync`/`import media` scenarios pass `--skip-confirmation`, which Node does not register
(its gate is `requireConfirm`, which registers only `--force`); `vip wp` needs an SSH/WebSocket
fake speaking Node's protocol.

**`defensive-mode` IS convertible in principle** — trunk has `src/lib/rechallenge/`,
`src/lib/defensive-mode/` and four bins, so the review's "Go-only surface" claim was wrong. It
needs a Node-shaped rechallenge mock first.

---

## 4c. Live Parker gate — RESOLVED

`make test-parity` compares the exact 15 allowlisted read-only scenarios against local Parker.
It defaults to the VIP Sys Admin in the canonical seed (`VIP_PARKER_USER_ID=1`) and still accepts
an override after a reseed. Node must already have a matching local-Parker credential in its
stable `vip-go-cli:http---localhost-4000` keychain service; the harness deliberately never writes
or cleans that developer-owned credential.

The runner removes ambient color controls and pins `TERM=dumb`, so empty `COLORTERM`, CI markers,
or terminal-program hints cannot create ANSI-only Node/Go differences. On 2026-08-18 the live
gate passed `compared=15 equal=15 expected-drift=0` from the normal Codex environment, without
manually unsetting color variables.

---

## 4d. Headless Linux: the keychain fallback notice

On a host with no D-Bus secret service — a container, a CI runner, a bare SSH
session — `vip-next` cannot reach an OS keyring and stores credentials in a
0600 file instead, announcing it once on stderr:

```
warning: OS keyring unavailable; storing credentials in ~/.config/vip/credentials.json (0600)
```

The Node CLI uses `configstore` unconditionally and has no equivalent notion,
so it prints nothing. Anyone scripting against `vip` on a headless Linux box
and asserting on empty stderr will see this line appear after cutover.

Announce it; do not "fix" it by removing the warning. Storing a credential in
a plaintext file is worth saying out loud, and the file backend is a genuine
fallback rather than the intended path.

The parity harness normalizes this one line away globally
(`ambientStderrRules` in `internal/parity/diff.go`). It has to: the notice
appears in every scenario on Linux and in none on macOS, so left in place it
fails 32 differential scenarios on one platform and zero on the other. That is
a property of the environment, not of any command, which is why it is recorded
here once rather than as 32 per-scenario `expected_drift` entries.

## 5. Known-broken, carried forward (not cutover blockers)

- dev-env `sync sql --force` is registered but never read, and sync has no running-environment
  gate (Node's is at `src/bin/vip-dev-env-sync-sql.js`).
- `validateImportFileExtension` is not ported to dev-env import — Node rejects anything but
  `.sql`/`.gz`.
- `checkAliasConflict` scans argv textually for `--app`/`--env` and will not catch `-a`/`-e`.
- `--skip-confirmation` sits on `import media`'s PersistentFlags, so `import media status`
  inherits it; Node has neither.
- `--saveErrorLog` cannot be passed bare (Node registers it as `[value]`).
- Lone-`\r` line endings: Node's readline splits on `/\r?\n|\r(?!\n)/`, Go only on `\n`.
- dev-env WordPress version validation unported — porting Node's naively would reject every
  valid version offline.
- `make test-parity` build agents / `gh` auth for `make vendor-search-replace`, and the macOS
  nested-binary signing step — see `docs/BUILD-SIGNING.md`.

_Fixed since this list was written:_ the `--search-replace` double-apply (now 1.23), the
unconditional table ANSI (`internal/output/table.go` now gates on `terminalTableIsTTY`, which is
what took 10 differential scenarios to byte-identical), and the missing `linux/arm64`
`go-search-replace` binary (`third_party/`, checksum-verified).
