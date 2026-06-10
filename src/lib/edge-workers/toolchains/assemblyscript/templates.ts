/**
 * The files written into a scaffolded AssemblyScript project. Kept out of the
 * toolchain logic so the scaffold steps read cleanly; the dynamic bits (SDK
 * package name, workers dir, default entry) interpolate from shared constants so
 * there's a single source of truth.
 */

import {
	ASSEMBLYSCRIPT_VERSION,
	BUILD_DIR,
	DEFAULT_ENTRY,
	SDK_PACKAGE,
	SDK_VERSION,
} from './constants';
import { WORKERS_DIR } from '../../project';

export const PACKAGE_JSON = {
	name: 'edge-workers',
	version: '0.0.0',
	private: true,
	description: 'VIP edge workers',
	type: 'module',
	scripts: {
		build: 'vip edge-workers build --all',
	},
	dependencies: {
		[ SDK_PACKAGE ]: SDK_VERSION,
	},
	devDependencies: {
		assemblyscript: ASSEMBLYSCRIPT_VERSION,
	},
};

export const TSCONFIG_JSON = {
	extends: 'assemblyscript/std/assembly.json',
	include: [ './**/*.ts' ],
};

export const GITIGNORE = `node_modules/
${ BUILD_DIR }/
`;

export const README = `# Edge workers

AssemblyScript edge workers for your VIP environment. Each worker lives in its
own folder under \`${ WORKERS_DIR }/\` and is compiled to a \`.wasm\` binary that
runs at the edge.

## Getting started

\`\`\`sh
npm install                       # install the SDK + compiler
vip edge-workers new my-worker    # scaffold a new worker
# edit ${ WORKERS_DIR }/my-worker/${ DEFAULT_ENTRY }
vip @my-site.develop edge-workers deploy my-worker
\`\`\`

Shared AssemblyScript modules go in \`lib/\` and can be imported from any worker.

## Parsing JSON

To work with JSON in a worker, install [json-as](https://www.npmjs.com/package/json-as)
(\`npm install --save-dev json-as@^1.3.4\`); the build enables its compiler
transform automatically when the package is present.
`;

export function starterWorker(): string {
	return `import {
	Request,
	Response,
	onClientRequest,
	onOriginRequest,
	onClientResponse,
	onOriginResponse,
} from '${ SDK_PACKAGE }';

// A worker re-exports \`alloc\` plus the host entrypoints for each phase it
// handles. Drop the ones you don't use (and their hooks below).
export {
	alloc,
	on_client_request,
	on_origin_request,
	on_client_response,
	on_origin_response,
} from '${ SDK_PACKAGE }/assembly/index';

// Client request: runs before the cache lookup, on every request.
onClientRequest( ( req: Request ): void => {} );

// Origin request: runs on a cache miss, before forwarding to origin.
onOriginRequest( ( req: Request ): void => {} );

// Client response: runs before the response reaches the client.
onClientResponse( ( res: Response ): void => {} );

// Origin response: runs after origin responds (cache miss); what you set here
// governs what the host caches.
onOriginResponse( ( res: Response ): void => {} );
`;
}
