/**
 * The files written into a scaffolded AssemblyScript project. Kept out of the
 * toolchain logic so the scaffold steps read cleanly; the dynamic bits (SDK
 * package name, workers dir, default entry) interpolate from shared constants so
 * there's a single source of truth.
 */

import { ASSEMBLYSCRIPT_VERSION, DEFAULT_ENTRY, SDK_PACKAGE, SDK_VERSION } from './constants';
import { BUILD_DIR, WORKERS_DIR } from '../../project';

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

Commit the generated \`package-lock.json\` after \`npm install\` so installs use the
reviewed dependency tree in local development and automation.

Shared AssemblyScript modules go in \`lib/\` and can be imported from any worker.

## Parsing JSON

To work with JSON in a worker, install [json-as](https://www.npmjs.com/package/json-as)
(\`npm install --save-dev json-as@^1.3.4\`); the build enables its compiler
transform automatically when the package is present.
`;

export function starterWorker(): string {
	return `import { Response, onClientResponse } from '${ SDK_PACKAGE }';

export { alloc, on_client_response } from '${ SDK_PACKAGE }/assembly/index';

// Client response: runs before the response reaches the client.
onClientResponse( ( response: Response ): void => {} );

// Other available phases are intentionally inactive. To activate one, add its
// SDK type and hook to the import above, its host entrypoint to the export above,
// and its handler below. Do not export a phase without implementing its hook.
//
// Client request: Request, onClientRequest, on_client_request
// onClientRequest( ( request: Request ): void => {} );
//
// Origin request: Request, onOriginRequest, on_origin_request
// onOriginRequest( ( request: Request ): void => {} );
//
// Origin response: Response, onOriginResponse, on_origin_response
// onOriginResponse( ( response: Response ): void => {} );
`;
}
