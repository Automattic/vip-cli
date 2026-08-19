#!/usr/bin/env node

import { appQuery, findEdgeWorkerByName, setEdgeWorkerActive } from '../lib/api/edge-workers';
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { escapeTerminalText } from '../lib/edge-workers/output';
import { trackEventWithEnv } from '../lib/tracker';

const usage = 'vip edge-workers disable';

const examples = [
	{
		usage: 'vip @example-app.production edge-workers disable my-worker',
		description: 'Disable the deployed worker named "my-worker".',
	},
];

export async function edgeWorkersDisableCommand( args = [], opt = {} ) {
	const { app, env } = opt;
	const name = args[ 0 ];

	await trackEventWithEnv( app.id, env.id, 'edge_workers_disable_command_execute', { name } );

	try {
		const worker = await findEdgeWorkerByName( app.id, env.id, name );
		if ( ! worker ) {
			throw new Error( `No edge worker named "${ name }" is deployed to this environment.` );
		}

		await setEdgeWorkerActive( env.id, worker.id, false );

		await trackEventWithEnv( app.id, env.id, 'edge_workers_disable_command_success', { name } );
		console.log( `✓ Disabled edge worker "${ escapeTerminalText( name ) }".` );
	} catch ( err ) {
		await trackEventWithEnv( app.id, env.id, 'edge_workers_disable_command_error', {
			name,
			error: 'disable_failed',
		} );
		exit.withError( `Failed to disable edge worker: ${ escapeTerminalText( err.message ) }` );
	}
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 1,
	usage,
} )
	.examples( examples )
	.argv( process.argv, edgeWorkersDisableCommand );
