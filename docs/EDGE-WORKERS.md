# Edge workers

This guide is the operator contract for scaffolding, validating, deploying, and managing VIP
edge workers with VIP-CLI.

## 1. Prerequisites and the inactive-create guarantee

Use Node.js 22.19.0 or newer, npm 8 or newer, an authenticated VIP-CLI session, and access to the
target application and environment. Start in a non-production environment.

The safe lifecycle depends on `createEdgeWorker` creating every new worker with `active: false`.
That is a required platform contract, not a behavior this repository can prove. Release remains
blocked until Task 8 records authoritative evidence from the API owner that inactive creation is
guaranteed. Do not deploy or publish this CLI feature on the basis of the client implementation
alone.

## 2. Project layout and exact dependency versions

`vip edge-workers init` creates the project root; `new` and `build` extend it with the per-worker
and generated paths shown below:

```text
edge-workers/
├── edge-workers.json
├── package.json
├── tsconfig.json
├── lib/                       # optional shared modules
├── build/                     # created by build
└── workers/
    └── <name>/
        ├── worker.json
        └── assembly/index.ts
```

`build/` is created when a worker is compiled and is ignored by Git. The generated direct
dependencies are exact: `@automattic/vip-edge-workers-sdk` is `0.3.0` and `assemblyscript` is
`0.27.0`. The starter exports only `alloc` and `on_client_response`; the other request phases are
commented examples and are not active WASM exports.

## 3. `edge-workers.json` schema

The project descriptor selects the toolchain for every worker in the project:

```json
{
	"type": "assemblyscript",
	"sdk": "@automattic/vip-edge-workers-sdk@0.3.0"
}
```

`type` is required and currently accepts only `assemblyscript`. `sdk` is optional metadata that
records the generated SDK dependency. Workers are discovered from `workers/*/worker.json`; the
project descriptor is not a worker registry.

## 4. `worker.json` schema and location tri-state

Each worker has its own manifest:

```json
{
	"name": "security-headers",
	"entry": "assembly/index.ts",
	"location": {
		"operator": "starts_with",
		"value": "/api/"
	},
	"on_failure": "continue"
}
```

- `name` is required, is unique within an environment, and must be a portable file name of at most
  64 characters. Path separators, control characters, Windows-reserved names, `.` and `..`, and
  trailing dots or spaces are rejected.
- `entry` is required, must be relative, and must stay inside the worker directory.
- `location` is optional. Its `operator` is `contains`, `equals`, `starts_with`, or `ends_with`, and
  `value` must be a non-empty string.
- `on_failure` is optional and is either `continue` or `error`.

`location` has three distinct update states:

| Manifest state  | Create                | Update                                              |
| --------------- | --------------------- | --------------------------------------------------- |
| Omitted         | Apply to all requests | Preserve the stored location                        |
| `null`          | Apply to all requests | Clear the stored location and apply to all requests |
| Location object | Store that location   | Replace the stored location                         |

## 5. Safe scaffold workflow and the lockfile

Initialize only an absent or empty target directory, install the pinned direct dependencies, and
commit the npm lockfile:

```sh
vip edge-workers init
cd edge-workers
npm install
git add package-lock.json
git commit -m "build: lock edge-worker dependencies"
vip edge-workers new security-headers --location starts_with:/api/
```

`new` validates the worker name and location before writing. Without `--location`, it reports that
the worker applies to all requests and directs you to edit `worker.json` before deployment if that
scope is too broad. A generated worker activates only the `client_response` phase. Implement and
review that handler before activating any commented phase example.

Use `--path <project>` with `new`, `build`, `validate`, or `deploy` when auto-discovery should not be
used.

## 6. Build and validation limits

Build one worker with `vip edge-workers build <name>`. Both `vip edge-workers build` and
`vip edge-workers build --all` build every discovered worker. Each successful line reports the
relative `build/<name>.wasm` path and exact byte size. The build stops on the first compiler error;
an empty project is an error.

Validate against a non-production environment before deploying:

```sh
vip @example-app.develop edge-workers validate security-headers
vip @example-app.develop edge-workers validate --all
```

Validation parses each selected worker manifest. A normal build also reads the project descriptor;
then validation compiles the worker and sends the compiled WASM to the environment's server-side
dry-run validator. It reports validity and detected phases. Validation does not execute requests
and does not prove runtime behavior, performance, routing correctness, or application
compatibility. `--skip-build` reads the existing `build/<name>.wasm`; it does not verify that the
artifact matches the current source.

## 7. Deployment plan fields and production confirmation

Deploy prepares every selected worker before applying any remote mutation. Preparation reconciles
the name as a create or update, builds or reads the artifact, validates it unless
`--skip-validate` is passed, determines location and source behavior, and then prints a plan with:

- `worker`, `action`, and current `active` state;
- `current_scope` and `proposed_scope`;
- `validation` and detected `phases`;
- compiled `bytes`; and
- `source` mode (`store`, `omit`, or `preserve`).

Review the entire plan. A production deploy requires an interactive confirmation naming every
worker, unless the operator deliberately passes `--skip-confirmation`. A worker name and `--all`
cannot be combined. `--skip-build`, `--skip-validate`, and `--skip-confirmation` remove safety
checks and should be used only when the omitted step has separate, current evidence.

Subject to the unresolved inactive-create guarantee in section 1, creating or updating a worker
does not enable it. Enabling is a separate command.

## 8. Source storage and `--skip-source`

By default, deploy stores the worker's UTF-8 entry file alongside the WASM binary. It does not
archive the full project or shared modules. `get` omits source by default; pass `--source` to make
the additional on-demand source query and print the stored value.

`--skip-source` means: do not store source on create; preserve stored source on update. Without
the flag, an update replaces the stored source with the current entry file, including an empty
file. The plan's `source` column shows the selected behavior before mutation.

## 9. Enable, disable, delete, and rollback

- `enable <name>` makes a deployed worker active. Production requires confirmation or the explicit
  `--skip-confirmation` bypass.
- `disable <name>` makes a deployed worker inactive.
- `delete <name>` permanently removes a deployed worker. It prompts in every environment unless
  `--force` is passed.

There is no automatic rollback command and an `--all` failure is not rolled back. To recover,
disable the affected worker first, inspect its current state, then deploy a reviewed known-good
source/artifact or delete the worker if permanent removal is intended. Do not describe a redeploy
as a rollback unless the exact prior source, manifest, dependencies, and compiled artifact are
available and verified.

## 10. `--all` and partial failures

`build` with no name, `build --all`, `validate --all`, and `deploy --all` operate on workers in
stable name order. Deploy preparation completes for all selected workers before remote writes
begin, so a preparation or validation failure applies none of them.

Application is sequential. If a create or update fails, deployment stops immediately and reports
the workers already applied, the failed worker, the workers not applied, and the original cause.
It does not retry or roll back already-applied workers. Reconcile the reported names with `list`
and `get` before retrying.

## 11. Automation flags and `VIP_NON_INTERACTIVE=1`

Automation should provide an explicit `@app.environment` alias (or equivalent app/environment
options), an explicit worker name or `--all`, and `--path` when the working directory is not inside
the project. Relevant bypasses are `--skip-build`, `--skip-validate`, `--skip-source`, and
`--skip-confirmation` for deploy; `--skip-build` for validate; `--skip-confirmation` for enable;
and `--force` for delete. `list` supports the global `--format` output option.

Set `VIP_NON_INTERACTIVE=1` to prevent interactive edge-worker production confirmation. In that
mode, production `deploy` and `enable` fail closed unless `--skip-confirmation` is also supplied.
The environment variable is not approval: the bypass flag must represent an explicit operator or
pipeline authorization. Delete confirmation is independent; use `--force` only with equivalent
authorization.

## 12. Non-production manual lifecycle

Exercise the complete lifecycle on a non-production environment first:

```sh
vip edge-workers init
cd edge-workers
npm install
# Review and commit package-lock.json.
vip edge-workers new security-headers --location starts_with:/api/
# Implement and review workers/security-headers/assembly/index.ts.
vip edge-workers build security-headers
vip @example-app.develop edge-workers validate security-headers
vip @example-app.develop edge-workers deploy security-headers
vip @example-app.develop edge-workers list
vip @example-app.develop edge-workers get security-headers --source
vip @example-app.develop edge-workers enable security-headers
# Send controlled requests and observe application behavior.
vip @example-app.develop edge-workers disable security-headers
```

Do not enable the deployed worker until the inactive-create guarantee in section 1 has owner
evidence and the printed deployment plan matches the reviewed artifact, phases, scope, source
mode, and byte size. Promote to production only after the non-production lifecycle and a separate
production change review succeed.
