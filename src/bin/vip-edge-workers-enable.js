#!/usr/bin/env node

import { appQuery, findEdgeWorkerByName, setEdgeWorkerActive } from '../lib/api/edge-workers';
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import {
	confirmProductionEdgeWorkerMutation,
	isInteractiveEdgeWorkers,
} from '../lib/edge-workers/confirmation';
import { confirm } from '../lib/envvar/input';
import { trackEventWithEnv } from '../lib/tracker';

const usage = 'vip edge-workers enable';

const examples = [
	{
		usage: 'vip @example-app.production edge-workers enable my-worker',
		description: 'Enable the deployed worker named "my-worker".',
	},
];

export async function edgeWorkersEnableCommand( args = [], opt = {} ) {
	const { app, env } = opt;
	const name = args[ 0 ];

	await trackEventWithEnv( app.id, env.id, 'edge_workers_enable_command_execute', { name } );

	try {
		const worker = await findEdgeWorkerByName( app.id, env.id, name );
		if ( ! worker ) {
			exit.withError( `No edge worker named "${ name }" is deployed to this environment.` );
		}

		await confirmProductionEdgeWorkerMutation(
			{
				action: 'enable',
				appName: app.name,
				envType: env.type,
				workerNames: [ worker.name ],
				skipConfirmation: Boolean( opt.skipConfirmation ),
				nonInteractive: ! isInteractiveEdgeWorkers( opt ),
			},
			confirm
		);

		await setEdgeWorkerActive( env.id, worker.id, true );

		await trackEventWithEnv( app.id, env.id, 'edge_workers_enable_command_success', { name } );
		console.log( `✓ Enabled edge worker "${ name }".` );
	} catch ( err ) {
		await trackEventWithEnv( app.id, env.id, 'edge_workers_enable_command_error', {
			name,
			error: err.message,
		} );
		exit.withError( `Failed to enable edge worker: ${ err.message }` );
	}
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 1,
	usage,
} )
	.option( 'skip-confirmation', 'Skip the production enable confirmation.', false )
	.examples( examples )
	.argv( process.argv, edgeWorkersEnableCommand );
