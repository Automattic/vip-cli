#!/usr/bin/env node

import {
	appQuery,
	createEdgeWorker,
	findEdgeWorkerByName,
	updateEdgeWorker,
	validateEdgeWorker,
} from '../lib/api/edge-workers';
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { buildWorker, readPrebuiltWorker, readWorkerSource } from '../lib/edge-workers';
import { discoverWorkers, findWorker, resolveProjectDir } from '../lib/edge-workers/project';
import { trackEventWithEnv } from '../lib/tracker';

const usage = 'vip edge-workers deploy';

const examples = [
	{
		usage: 'vip @example-app.develop edge-workers deploy my-worker',
		description: 'Compile and deploy a single worker to the develop environment.',
	},
	{
		usage: 'vip @example-app.develop edge-workers deploy --all',
		description: 'Compile and deploy every worker in the project.',
	},
	{
		usage: 'vip @example-app.develop edge-workers deploy my-worker --skip-build',
		description: 'Deploy a previously compiled artifact without recompiling.',
	},
];

async function deployWorker( app, env, projectDir, worker, opt ) {
	const artifact = opt.skipBuild
		? readPrebuiltWorker( projectDir, worker )
		: buildWorker( projectDir, worker );

	const { name, location, on_failure: onFailure } = worker.manifest;

	// Server-side dry-run validation before the real upload: persists nothing and
	// fails fast with structured errors. The create/update below validates again,
	// so `--skip-validate` just trades the early check for a slightly later one.
	if ( ! opt.skipValidate ) {
		const validation = await validateEdgeWorker( env.id, artifact.base64 );
		if ( validation && ! validation.valid ) {
			const errors = ( validation.errors || [] ).join( '; ' ) || 'unknown error';
			throw new Error( `worker "${ name }" failed validation: ${ errors }` );
		}
	}

	const source = opt.skipSource ? undefined : readWorkerSource( worker );

	const existing = await findEdgeWorkerByName( app.id, env.id, name );

	const input = {
		wasmBinary: artifact.base64,
		...( onFailure ? { onFailure } : {} ),
		...( source ? { source } : {} ),
	};

	if ( existing ) {
		// Location is always sent on update: null clears the rule, so removing
		// `location` from the manifest reverts the worker to running everywhere.
		const result = await updateEdgeWorker( env.id, existing.id, {
			name,
			...input,
			location: location ?? null,
		} );
		return { action: 'updated', worker: result, sizeBytes: artifact.sizeBytes };
	}

	const result = await createEdgeWorker( env.id, {
		name,
		...input,
		...( location ? { location } : {} ),
	} );
	return { action: 'created', worker: result, sizeBytes: artifact.sizeBytes };
}

export async function edgeWorkersDeployCommand( args = [], opt = {} ) {
	const { app, env } = opt;
	const name = args[ 0 ];

	await trackEventWithEnv( app.id, env.id, 'edge_workers_deploy_command_execute', {
		name,
		all: Boolean( opt.all ),
	} );

	try {
		const projectDir = resolveProjectDir( { path: opt.path } );

		let workers;
		if ( opt.all ) {
			workers = discoverWorkers( projectDir );
			if ( ! workers.length ) {
				exit.withError( 'No workers found in this project.' );
			}
		} else if ( name ) {
			workers = [ findWorker( projectDir, name ) ];
		} else {
			exit.withError( 'Please supply a worker name to deploy, or pass `--all`.' );
		}

		// Deploy sequentially for clear, ordered output and to avoid hammering the API.
		for ( const worker of workers ) {
			// eslint-disable-next-line no-await-in-loop
			const result = await deployWorker( app, env, projectDir, worker, opt );
			const { action, worker: deployed, sizeBytes } = result;
			const phases = deployed?.phases;
			const phasesNote = phases ? `, phases: ${ phases.join( ', ' ) || 'none' }` : '';
			console.log(
				`✓ ${ action } "${ worker.manifest.name }" (${ sizeBytes } bytes${ phasesNote })`
			);
		}

		await trackEventWithEnv( app.id, env.id, 'edge_workers_deploy_command_success', {
			count: workers.length,
		} );
	} catch ( err ) {
		await trackEventWithEnv( app.id, env.id, 'edge_workers_deploy_command_error', {
			name,
			error: err.message,
		} );
		exit.withError( `Failed to deploy edge worker: ${ err.message }` );
	}
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	usage,
} )
	.option( 'path', 'Path to the edge-workers project. Defaults to auto-discovery.' )
	.option( 'all', 'Deploy every worker in the project.', false )
	.option( 'skip-build', 'Deploy a previously compiled artifact without recompiling.', false )
	.option( 'skip-validate', 'Skip server-side dry-run validation before uploading.', false )
	.option( 'skip-source', 'Do not store the worker source alongside the binary.', false )
	.examples( examples )
	.argv( process.argv, edgeWorkersDeployCommand );
