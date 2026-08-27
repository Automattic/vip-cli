# Edge workers

This guide is the operator contract for scaffolding, validating, deploying, and managing VIP
edge workers with VIP-CLI.

## 1. Prerequisites and the inactive-create guarantee

Use Node.js 22.19.0 or newer, npm 8 or newer, an authenticated VIP-CLI session, and access to the
target application and environment. Start in a non-production environment.

The platform API creates every new worker with `active: false`; create does not accept an active
input. The API also applies a database default of inactive as defense in depth. VIP-CLI relies on
this enforced contract: deploy uploads a new worker first, confirms the returned inactive state,
and enables it only when the operator explicitly passes `--enable`.

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
dependencies are exact: `@automattic/vip-edge-workers-sdk` is `0.3.2` and `assemblyscript` is
`0.27.0`. The starter exports only `alloc` and `on_client_response`; the other request phases are
commented examples and are not active WASM exports.

## 3. `edge-workers.json` schema

The project descriptor selects the toolchain for every worker in the project:

```json
{
	"type": "assemblyscript",
	"sdk": "@automattic/vip-edge-workers-sdk@0.3.2"
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

- `worker`, `action`, `current_active`, and `final_active`;
- `current_scope` and `proposed_scope`;
- `validation` and detected `phases`;
- compiled `bytes`; and
- `source` mode (`store`, `omit`, or `preserve`).

Review the entire plan. A production deploy requires an interactive confirmation naming every
worker, unless the operator deliberately passes `--skip-confirmation`. A worker name and `--all`
cannot be combined. `--skip-build`, `--skip-validate`, and `--skip-confirmation` remove safety
checks and should be used only when the omitted step has separate, current evidence.

Deploy is upload-only by default. A newly created worker remains inactive, and an update to an
inactive worker remains inactive. Pass `--enable` to enable a newly created or currently inactive
worker after its upload succeeds. An update to an already-active worker stays active and skips the
redundant enable request, even when `--enable` is present; the uploaded code and configuration
therefore become live immediately. Disable an active worker first when the update must not become
live on deployment.

The plan and the single deployment confirmation cover both the upload and requested enable phase.
For `--all`, every worker's planned final state is visible before any remote mutation begins.

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

If the enable phase of `deploy --enable` fails or times out, the worker's final active state is
unknown. The command reports the last confirmed upload result and does not retry, roll back,
disable, or delete the worker automatically. Use `edge-workers list` and `edge-workers get <name>`
to verify the remote state before taking another action. Do not assume the worker remained
inactive.

## 10. `--all` and partial failures

`build` with no name, `build --all`, `validate --all`, and `deploy --all` operate on workers in
stable name order. Deploy preparation completes for all selected workers before remote writes
begin, so a preparation or validation failure applies none of them.

Application is sequential. Each worker's upload completes before its enable phase can begin. If a
create or update fails, deployment stops immediately and reports the workers already applied, the
failed worker, the workers not applied, and the original cause. If an enable fails, deployment
reports that worker's confirmed upload state, treats its final active state as unknown, and stops
before later workers. It does not retry, roll back, disable, or delete already-applied workers.
Reconcile the reported names with `list` and `get` before retrying.

## 11. Automation flags and `VIP_NON_INTERACTIVE=1`

Automation should provide an explicit `@app.environment` alias (or equivalent app/environment
options), an explicit worker name or `--all`, and `--path` when the working directory is not inside
the project. Relevant bypasses are `--skip-build`, `--skip-validate`, `--skip-source`, and
`--skip-confirmation` for deploy. Deploy also accepts `--enable`, which is an action request rather
than a safety bypass and defaults to false. Validate accepts `--skip-build`; enable accepts
`--skip-confirmation`; delete accepts `--force`. `list` supports the global `--format` output
option. There is no edge-workers `--non-interactive` flag or other confirmation bypass.

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
# Update the source while inactive, then upload and explicitly enable after the upload.
vip @example-app.develop edge-workers deploy security-headers --enable
# An update while already active becomes live on upload and skips a redundant enable request.
vip @example-app.develop edge-workers deploy security-headers --enable
vip @example-app.develop edge-workers disable security-headers
# Set location to null in worker.json and deploy to clear the stored location.
# Omit location on a later update to preserve the stored location.
# Confirm permanent deletion when prompted.
vip @example-app.develop edge-workers delete security-headers
```

Before each enable, verify that the printed deployment plan matches the reviewed artifact, phases,
scope, source mode, byte size, and final active state. If enable does not return a confirmed
result, stop and verify with `list` and `get`; do not infer the final state. Promote to production
only after the non-production lifecycle and a separate production change review succeed.
