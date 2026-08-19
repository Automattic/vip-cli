#!/usr/bin/env node

import { appQuery, validateEdgeWorker } from '../lib/api/edge-workers';
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { buildWorker, readPrebuiltWorker } from '../lib/edge-workers';
import { discoverWorkers, findWorker, resolveProjectDir } from '../lib/edge-workers/project';
import { trackEventWithEnv } from '../lib/tracker';

const usage = 'vip edge-workers validate';

const examples = [
	{
		usage: 'vip @example-app.develop edge-workers validate my-worker',
		description:
			'Validate the local manifest and compiled WASM without deploying or executing requests.',
	},
	{
		usage: 'vip @example-app.develop edge-workers validate --all',
		description: 'Validate every worker in the project.',
	},
	{
		usage: 'vip @example-app.develop edge-workers validate my-worker --skip-build',
		description: 'Validate a previously compiled artifact without recompiling.',
	},
];

export async function edgeWorkersValidateCommand( args = [], opt = {} ) {
	const { app, env } = opt;
	const name = args[ 0 ];

	await trackEventWithEnv( app.id, env.id, 'edge_workers_validate_command_execute', {
		name,
		all: Boolean( opt.all ),
	} );

	let invalidCount = 0;
	try {
		const projectDir = resolveProjectDir( { path: opt.path } );

		let workers;
		if ( opt.all ) {
			workers = discoverWorkers( projectDir );
			if ( ! workers.length ) {
				throw new Error( 'No workers found in this project.' );
			}
		} else if ( name ) {
			workers = [ findWorker( projectDir, name ) ];
		} else {
			throw new Error( 'Please supply a worker name to validate, or pass `--all`.' );
		}

		// Validate sequentially for clear, ordered output.
		for ( const worker of workers ) {
			const artifact = opt.skipBuild
				? readPrebuiltWorker( projectDir, worker )
				: buildWorker( projectDir, worker );

			// eslint-disable-next-line no-await-in-loop
			const result = await validateEdgeWorker( env.id, artifact.base64 );

			if ( result && ! result.valid ) {
				invalidCount++;
				const errors = ( result.errors || [] ).join( '; ' ) || 'unknown error';
				console.log( `✕ "${ worker.manifest.name }" is invalid: ${ errors }` );
			} else {
				const phases = ( result?.phases || [] ).join( ', ' ) || 'none';
				console.log( `✓ "${ worker.manifest.name }" is valid (phases: ${ phases })` );
			}
		}

		if ( invalidCount > 0 ) {
			throw new Error( `${ invalidCount } worker(s) failed validation.` );
		}

		await trackEventWithEnv( app.id, env.id, 'edge_workers_validate_command_success', {
			count: workers.length,
			invalid: invalidCount,
		} );
	} catch ( err ) {
		await trackEventWithEnv( app.id, env.id, 'edge_workers_validate_command_error', {
			name,
			error: err.message,
		} );
		exit.withError( `Failed to validate edge worker: ${ err.message }` );
	}
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	usage,
} )
	.option( 'path', 'Path to the edge-workers project. Defaults to auto-discovery.' )
	.option( 'all', 'Validate every worker in the project.', false )
	.option( 'skip-build', 'Validate a previously compiled artifact without recompiling.', false )
	.examples( examples )
	.argv( process.argv, edgeWorkersValidateCommand );
