# Debugging

## Using debugger

A debugger can easily be used to help pinpointing issues with the code. Follow these steps.

1. First, make sure to run the `npm run build:watch`, this will generate source maps
2. Run the command you want via `node --inspect`, like so: `node --inspect ./dist/bin/vip-dev-env-import-sql.js`
3. Note the port the debugger is listening on:

```
Debugger listening on ws://127.0.0.1:9229/db6c03e9-2585-4a08-a1c6-1fee0295c9ff
For help, see: https://nodejs.org/en/docs/inspector
```

4. In your editor of choice attach to the debugger. For VSCode: Hit 'Run and Debug' panel, hit the "gear" icon (open launch.json), make your `Attach` configuration entry to look like so:
   Make sure the `port` matches the port from step 3, and the `runtimeExecutable` matches the exact `node` executable you ran. If you use a version manager like `nvm`, its especially important to check this.

```json
{
	"name": "Attach",
	"port": 9229,
	"request": "attach",
	"skipFiles": [ "<node_internals>/**" ],
	"type": "node",
	"runtimeExecutable": "/Users/user/.nvm/versions/node/v14.18.2/bin/node"
}
```

5. Set your breakpoints, add debug code, and hit the play button.
6. Confirm that you attached the debugger to continue command execution.
7. Resolve the problem.
8. [Optional but recommended] Pay it forward and implement a similar approach to other internal/external tooling.

## Go CLI diagnostics

Use `-d` or `--debug` to send diagnostics to stderr while keeping command results on stdout:

```sh
vip-next dev-env list --debug
vip-next @example.develop edge-workers list -d --format=json > workers.json
```

The Go CLI uses the corresponding Node CLI namespaces. Select namespaces with a
comma-separated list or wildcards, and exclude namespaces with a leading `-`:

```sh
vip-next @example.develop edge-workers list --debug='@automattic/vip:http*'
vip-next dev-env list --debug='*,-vip:proxy-dispatcher'
DEBUG='@automattic/vip:bin:dev-environment' vip-next dev-env list
```

A nonempty debug flag overrides `DEBUG`. For remote WP-CLI, put VIP's debug flag **before**
`wp`; arguments after `wp` belong to WP-CLI:

```sh
vip-next @example.develop -d wp option get home
```

### Available diagnostics

| Namespace                                                                                  | Diagnostics                                                                                         |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `@automattic/vip:http`                                                                     | API requests, without URL credentials or arbitrary query parameters                                 |
| `@automattic/vip:http:graphql`                                                             | Failed requests, retries, operation names, HTTP status, safe GraphQL error metadata                 |
| `vip:proxy-dispatcher`                                                                     | Selected proxy scheme and host                                                                      |
| `@automattic/vip:analytics:clients:pendo`                                                   | Telemetry send/skip stages and HTTP response status, without credentials, event properties or response bodies |
| `@automattic/vip:rechallenge:*`                                                            | Step-up session creation, pending polling, flow failures                                            |
| `@automattic/vip:bin:dev-environment`                                                      | Local environment lifecycle, discovered environments, container status, import and execution stages |
| `@automattic/vip:bin:config:envvar`                                                        | Remote and local environment-variable operations, without values                                    |
| `@automattic/vip:bin:config-software`                                                      | Software update requests and polling                                                                |
| `@automattic/vip:bin:vip-app-deploy*`                                                      | Deployment validation and upload/deployment stages                                                  |
| `@automattic/vip:bin:vip-import-sql`, `vip:vip-import-sql`, `vip:validations:line-by-line` | SQL import options and validation summaries                                                         |
| `vip:vip-import-media`                                                                     | Media import summaries                                                                              |
| `vip:lib/client-file-uploader`                                                             | Compression, checksum computation, upload strategy and completion                                   |
| `vip:lib/site-import/status`                                                               | SQL import job and step status                                                                      |
| `@automattic/vip:lib:search-and-replace`                                                   | Input/output routing and processing stages                                                          |
| `@automattic/vip:wp`, `@automattic/vip:wp/ssh`                                             | Remote connection, retry and exit stages                                                            |

Messages follow each runtime's implementation. Go uses Compose rather than Lando,
so Lando initialization messages do not apply. Raw argument, configuration,
response, SQL and credential dumps from older Node diagnostics are replaced with
targeted summaries. A successful command can remain quiet when its implementation
has no applicable diagnostics, or when its namespaces are excluded.

The command-family audit covered app, backup, cache, config, db, defensive-mode,
dev-env, edge-workers, export, import, login, logout, logs, search-replace,
slowlogs, sync, update, whoami and wp. Families without command-specific Node
diagnostics use shared request logging where applicable. The Go-only updater has
no Node command diagnostics to port. Use `DEBUG` to inspect Pendo delivery during
authentication bootstrap, before command flags are parsed. Pendo requests use the
current stored token and are skipped when no token is available. Delivery failures
do not fail the command. Tracking opt-outs also disable Pendo; these diagnostics
do not add credential-store dumps.
