#!/usr/bin/env node

import path from 'node:path';

import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { buildWorker } from '../lib/edge-workers';
import { discoverWorkers, findWorker, resolveProjectDir } from '../lib/edge-workers/project';
import { trackEvent } from '../lib/tracker';

const usage = 'vip edge-workers build';

const examples = [
	{
		usage: 'vip edge-workers build',
		description: 'Compile every worker in the project to WebAssembly.',
	},
	{
		usage: 'vip edge-workers build my-worker',
		description: 'Compile a single worker.',
	},
];

export async function edgeWorkersBuildCommand( args = [], opt = {} ) {
	const name = args[ 0 ];

	await trackEvent( 'edge_workers_build_command_execute', { name, all: Boolean( opt.all ) } );

	try {
		const projectDir = resolveProjectDir( { path: opt.path } );

		const workers =
			name && ! opt.all ? [ findWorker( projectDir, name ) ] : discoverWorkers( projectDir );

		if ( ! workers.length ) {
			exit.withError( 'No workers found in this project. Create one with `vip edge-workers new`.' );
		}

		for ( const worker of workers ) {
			const { wasmPath, sizeBytes } = buildWorker( projectDir, worker );
			console.log(
				`✓ Built "${ worker.manifest.name }" → ${ path.relative(
					projectDir,
					wasmPath
				) } (${ sizeBytes } bytes)`
			);
		}

		await trackEvent( 'edge_workers_build_command_success', { count: workers.length } );
	} catch ( err ) {
		await trackEvent( 'edge_workers_build_command_error', { name, error: err.message } );
		exit.withError( err.message );
	}
}

command( {
	requiredArgs: 0,
	usage,
} )
	.option( 'path', 'Path to the edge-workers project. Defaults to auto-discovery.' )
	.option( 'all', 'Compile every worker in the project.', false )
	.examples( examples )
	.argv( process.argv, edgeWorkersBuildCommand );
