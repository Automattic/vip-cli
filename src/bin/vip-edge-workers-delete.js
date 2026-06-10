#!/usr/bin/env node

import { appQuery, deleteEdgeWorker, findEdgeWorkerByName } from '../lib/api/edge-workers';
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { trackEventWithEnv } from '../lib/tracker';

const usage = 'vip edge-workers delete';

const examples = [
	{
		usage: 'vip @example-app.production edge-workers delete my-worker',
		description: 'Permanently delete the deployed worker named "my-worker".',
	},
];

export async function edgeWorkersDeleteCommand( args = [], opt = {} ) {
	const { app, env } = opt;
	const name = args[ 0 ];

	await trackEventWithEnv( app.id, env.id, 'edge_workers_delete_command_execute', { name } );

	try {
		const worker = await findEdgeWorkerByName( app.id, env.id, name );
		if ( ! worker ) {
			exit.withError( `No edge worker named "${ name }" is deployed to this environment.` );
		}

		await deleteEdgeWorker( env.id, worker.id );

		await trackEventWithEnv( app.id, env.id, 'edge_workers_delete_command_success', { name } );
		console.log( `✓ Deleted edge worker "${ name }".` );
	} catch ( err ) {
		await trackEventWithEnv( app.id, env.id, 'edge_workers_delete_command_error', {
			name,
			error: err.message,
		} );
		exit.withError( `Failed to delete edge worker: ${ err.message }` );
	}
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 1,
	requireConfirm: 'Are you sure you want to permanently delete this edge worker?',
	usage,
} )
	.examples( examples )
	.argv( process.argv, edgeWorkersDeleteCommand );
