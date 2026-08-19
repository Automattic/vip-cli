#!/usr/bin/env node

import path from 'node:path';

import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { parseLocationOption } from '../lib/edge-workers/location';
import {
	readProjectDescriptor,
	readWorkerManifest,
	resolveProjectDir,
	WORKERS_DIR,
	writeWorkerManifest,
} from '../lib/edge-workers/project';
import { getToolchain } from '../lib/edge-workers/toolchains';
import { EDGE_WORKER_LOCATION_OPERATORS } from '../lib/edge-workers/types';
import { validateWorkerName } from '../lib/edge-workers/validation';
import { trackEvent } from '../lib/tracker';

const usage = 'vip edge-workers new';

const examples = [
	{
		usage: 'vip edge-workers new add-security-headers',
		description: 'Add a new worker named "add-security-headers" to the current project.',
	},
	{
		usage: 'vip edge-workers new my-worker --path ./infra/edge',
		description: 'Add a worker to a project at a specific path.',
	},
	{
		usage: 'vip edge-workers new api-auth --location starts_with:/api/',
		description: 'Add a worker that only runs on request paths under /api/.',
	},
];

export async function edgeWorkersNewCommand( args = [], opt = {} ) {
	const name = args[ 0 ];

	await trackEvent( 'edge_workers_new_command_execute', { name } );

	if ( ! name ) {
		await trackEvent( 'edge_workers_new_command_error', { error: 'Missing name' } );
		exit.withError( 'Please supply a name for the new worker.' );
	}

	try {
		validateWorkerName( name );
		// Parse up front so a bad --location doesn't leave a half-created worker behind.
		const location = opt.location ? parseLocationOption( opt.location ) : undefined;
		const projectDir = resolveProjectDir( { path: opt.path } );
		const descriptor = readProjectDescriptor( projectDir );
		getToolchain( descriptor.type ).scaffoldWorker( projectDir, name );

		if ( location ) {
			const workerDir = path.join( projectDir, WORKERS_DIR, name );
			writeWorkerManifest( workerDir, { ...readWorkerManifest( workerDir ), location } );
		}

		await trackEvent( 'edge_workers_new_command_success', { name, type: descriptor.type } );

		const entryDir = path.join( WORKERS_DIR, name );
		console.log( `✓ Created worker "${ name }" in ${ path.join( projectDir, entryDir ) }` );
		console.log(
			location
				? `Scope: ${ location.operator } "${ location.value }".`
				: 'Scope: all requests. Set location in worker.json before deployment to narrow it.'
		);
		console.log( '\nEdit the worker, then deploy it with:' );
		console.log( `  vip @my-site.develop edge-workers deploy ${ name }` );
	} catch ( err ) {
		await trackEvent( 'edge_workers_new_command_error', { name, error: err.message } );
		exit.withError( err.message );
	}
}

command( {
	requiredArgs: 1,
	usage,
} )
	.option( 'path', 'Path to the edge-workers project. Defaults to auto-discovery.' )
	.option(
		'location',
		`Only run the worker on matching request paths, as "<operator>:<value>". Operators: ${ EDGE_WORKER_LOCATION_OPERATORS.join(
			', '
		) }.`
	)
	.examples( examples )
	.argv( process.argv, edgeWorkersNewCommand );
