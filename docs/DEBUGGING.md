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
