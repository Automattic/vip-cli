# Edge workers

AssemblyScript edge workers for your VIP environment. Each worker lives in its
own folder under `workers/` and is compiled to a `.wasm` binary that
runs at the edge.

## Getting started

```sh
npm install                       # install the SDK + compiler
vip edge-workers new my-worker    # scaffold a new worker
# edit workers/my-worker/assembly/index.ts
vip @my-site.develop edge-workers deploy my-worker
```

Commit the generated `package-lock.json` after `npm install` so installs use the
reviewed dependency tree in local development and automation.

Shared AssemblyScript modules go in `lib/` and can be imported from any worker.

## Parsing JSON

To work with JSON in a worker, install [json-as](https://www.npmjs.com/package/json-as)
(`npm install --save-dev json-as@^1.3.4`); the build enables its compiler
transform automatically when the package is present.
