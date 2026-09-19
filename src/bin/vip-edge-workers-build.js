#!/usr/bin/env node

import path from 'node:path';

import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { buildWorker } from '../lib/edge-workers';
import { escapeTerminalText } from '../lib/edge-workers/output';
import { discoverWorkers, findWorker, resolveProjectDir } from '../lib/edge-workers/project';
import { trackEvent } from '../lib/tracker';
import UserError from '../lib/user-error';

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
		if ( name && opt.all ) {
			throw new UserError( 'Supply either a worker name or --all, not both.' );
		}

		const projectDir = resolveProjectDir( { path: opt.path } );

		const workers = name ? [ findWorker( projectDir, name ) ] : discoverWorkers( projectDir );

		if ( ! workers.length ) {
			throw new UserError(
				'No workers found in this project. Create one with `vip edge-workers new`.'
			);
		}

		for ( const worker of workers ) {
			const { wasmPath, sizeBytes } = buildWorker( projectDir, worker );
			console.log(
				`✓ Built "${ escapeTerminalText( worker.manifest.name ) }" → ${ escapeTerminalText(
					path.relative( projectDir, wasmPath )
				) } (${ sizeBytes } bytes)`
			);
		}

		await trackEvent( 'edge_workers_build_command_success', { count: workers.length } );
	} catch ( err ) {
		await trackEvent( 'edge_workers_build_command_error', { name, error: 'build_failed' } );
		exit.withError( escapeTerminalText( err.message ) );
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
