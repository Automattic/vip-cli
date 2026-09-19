#!/usr/bin/env node

import { appQuery, deleteEdgeWorker, findEdgeWorkerByName } from '../lib/api/edge-workers';
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { confirmEdgeWorkerDeletion } from '../lib/edge-workers/confirmation';
import { escapeTerminalText } from '../lib/edge-workers/output';
import { confirm } from '../lib/envvar/input';
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
			throw new Error( `No edge worker named "${ name }" is deployed to this environment.` );
		}

		await confirmEdgeWorkerDeletion(
			{
				appName: app.name,
				envType: env.type,
				workerName: worker.name,
				force: Boolean( opt.force ),
			},
			confirm
		);

		await deleteEdgeWorker( env.id, worker.id );

		await trackEventWithEnv( app.id, env.id, 'edge_workers_delete_command_success', { name } );
		console.log( `✓ Deleted edge worker "${ escapeTerminalText( name ) }".` );
	} catch ( err ) {
		await trackEventWithEnv( app.id, env.id, 'edge_workers_delete_command_error', {
			name,
			error: 'delete_failed',
		} );
		exit.withError( `Failed to delete edge worker: ${ escapeTerminalText( err.message ) }` );
	}
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 1,
	usage,
} )
	.option( 'force', 'Skip confirmation.', false )
	.examples( examples )
	.argv( process.argv, edgeWorkersDeleteCommand );
