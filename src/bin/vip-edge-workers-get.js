#!/usr/bin/env node

import { appQuery, getEdgeWorker } from '../lib/api/edge-workers';
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { keyValue } from '../lib/cli/format';
import { escapeTerminalSource, escapeTerminalText } from '../lib/edge-workers/output';
import { trackEventWithEnv } from '../lib/tracker';

const usage = 'vip edge-workers get';

const examples = [
	{
		usage: 'vip @example-app.production edge-workers get my-worker',
		description: 'Show details for the deployed worker named "my-worker".',
	},
	{
		usage: 'vip @example-app.production edge-workers get my-worker --source',
		description: 'Also print the stored source code for the worker.',
	},
];

export async function edgeWorkersGetCommand( args = [], opt = {} ) {
	const { app, env } = opt;
	const name = args[ 0 ];
	const includeSource = opt.source === true;

	await trackEventWithEnv( app.id, env.id, 'edge_workers_get_command_execute', { name } );

	if ( ! name ) {
		exit.withError( 'Please supply the name of an edge worker.' );
	}

	let worker;
	try {
		worker = await getEdgeWorker( app.id, env.id, name, { includeSource } );
	} catch ( err ) {
		await trackEventWithEnv( app.id, env.id, 'edge_workers_get_command_error', {
			name,
			error: 'get_failed',
		} );
		exit.withError( `Failed to get edge worker: ${ escapeTerminalText( err.message ) }` );
	}

	if ( ! worker ) {
		await trackEventWithEnv( app.id, env.id, 'edge_workers_get_command_error', {
			name,
			error: 'Not found',
		} );
		exit.withError(
			`No edge worker named "${ escapeTerminalText( name ) }" is deployed to this environment.`
		);
	}

	await trackEventWithEnv( app.id, env.id, 'edge_workers_get_command_success', { name } );

	const location = worker.location
		? `${ escapeTerminalText( worker.location.operator ) } "${ escapeTerminalText(
				worker.location.value
		  ) }"`
		: 'all requests';

	console.log(
		keyValue( [
			{ key: 'ID', value: escapeTerminalText( worker.id ) },
			{ key: 'Name', value: escapeTerminalText( worker.name ) },
			{ key: 'Active', value: worker.active ? 'yes' : 'no' },
			{ key: 'Phases', value: ( worker.phases || [] ).map( escapeTerminalText ).join( ', ' ) },
			{ key: 'Location', value: location },
			{ key: 'On failure', value: escapeTerminalText( worker.onFailure ) },
			{ key: 'Created', value: escapeTerminalText( worker.createdAt ) },
			{ key: 'Modified', value: escapeTerminalText( worker.updatedAt ) },
		] )
	);

	if ( includeSource ) {
		console.log( '\nSource:' );
		console.log(
			worker.source === null || worker.source === undefined
				? '(no source stored)'
				: escapeTerminalSource( worker.source )
		);
	}
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 1,
	usage,
} )
	.option( 'source', 'Print the stored source code for the worker.', false )
	.examples( examples )
	.argv( process.argv, edgeWorkersGetCommand );
