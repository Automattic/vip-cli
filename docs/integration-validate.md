# `vip integration validate`

Checks a WordPress VIP partner integration for conformance and returns an
objective **conformant / not conformant** verdict — the gate a partner (or an
internal team) runs locally and in CI before submitting an integration.

```sh
vip integration validate [path]        # defaults to the current directory
vip integration validate --format json # machine-readable output for CI
```

- **Exit code.** `0` when conformant, `1` when any automated rule fails (or on a
  bad path argument / unknown `--format`), so it can gate a CI job directly.
- **`--format`.** `human` (default) or `json`. Any other value is an error.

## What it decides — and what it does not

The checker is a **static** analysis of the integration's files (composer.json,
package.json, docs, PHP source, CI workflows). Each rule reports `pass`, `fail`,
`warn`, or `n/a`, and only a `fail` breaks conformance. A `warn` flags something
the tool cannot verify statically (it does not run the integration's tests), so
a green result means "the integration is wired correctly," not "its tests pass."

Two things are **never** decided here and are printed as a _Human review
required_ section instead of a fake pass:

- **Plugin - platform config-schema match** — not fully deterministic.
- **Security review** — assessed by a human, not this checker.

## Automated rules

| #   | Rule                                                 | Fails when                                                                                                                                              |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Loads through the Starter Kit workflow               | No composer.json / invalid JSON, no plugin entry file, wrong Composer `type`, or missing `autoload`                                                     |
| 2   | `composer test` runs PHPUnit + e2e                   | `composer test` does not wire up `phpunit` and an e2e runner (Playwright/Cypress), resolving `npm`-delegated scripts and ignoring no-op `echo` commands |
| 3   | `composer run validate-integration` exists           | The script is absent                                                                                                                                    |
| 4   | Config constant documented + referenced              | The detected config constant is used in code but not documented                                                                                         |
| 5   | Missing/invalid config handled without fataling      | _(warn-only — static analysis cannot prove runtime behavior; verify via the integration's own tests)_                                                   |
| 6   | Docs include valid + incomplete config examples      | Fewer than two config examples, or no incomplete example                                                                                                |
| 7   | Compatibility matrix covers WP 6.9/7.0 + PHP 8.2–8.5 | The CI workflows do not cover the matrix and there is no approved exception note                                                                        |
| 8   | Build and test commands documented                   | Docs omit build/install or test commands                                                                                                                |
| 9   | Telemetry uses the Tracks helper, no secrets         | Telemetry uses Stats/Pixel _(warn if the guarded Tracks helper is not detected or property keys look sensitive)_                                        |

Rules 4–6 apply only when a runtime config constant is detected (a
`Config::CONSTANT_NAME` declaration or a `VIP_*_CONFIG` constant). If an
integration uses runtime config under a different name, adopt the convention or
flag it for human review — those checks are reported as skipped, not passed.
