#!/usr/bin/env node

import { appQuery, listEdgeWorkers } from '../lib/api/edge-workers';
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { escapeTerminalText } from '../lib/edge-workers/output';
import { trackEventWithEnv } from '../lib/tracker';

const usage = 'vip edge-workers list';

const examples = [
	{
		usage: 'vip @example-app.production edge-workers list',
		description: 'List all edge workers deployed to the production environment.',
	},
];

function formatLocation( location, escape ) {
	if ( ! location ) {
		return 'all requests';
	}

	return `${ escape( location.operator ) } "${ escape( location.value ) }"`;
}

export async function edgeWorkersListCommand( _args = [], opt = {} ) {
	const { app, env } = opt;

	await trackEventWithEnv( app.id, env.id, 'edge_workers_list_command_execute' );

	let workers;
	try {
		workers = await listEdgeWorkers( app.id, env.id );
	} catch ( err ) {
		await trackEventWithEnv( app.id, env.id, 'edge_workers_list_command_error', {
			error: 'list_failed',
		} );
		exit.withError( `Failed to list edge workers: ${ escapeTerminalText( err.message ) }` );
	}

	await trackEventWithEnv( app.id, env.id, 'edge_workers_list_command_success', {
		count: workers.length,
	} );

	if ( ! workers.length && opt.format !== 'json' ) {
		console.log( 'No edge workers are deployed to this environment.' );
		return [];
	}

	const escape = opt.format === 'json' ? value => value : escapeTerminalText;

	return workers.map( worker => ( {
		id: worker.id,
		name: escape( worker.name ),
		active: worker.active ? 'yes' : 'no',
		phases: ( worker.phases || [] ).map( escape ).join( ', ' ),
		location: formatLocation( worker.location, escape ),
		on_failure: escape( worker.onFailure ),
		modified: escape( worker.updatedAt ),
	} ) );
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	format: true,
	usage,
} )
	.examples( examples )
	.argv( process.argv, edgeWorkersListCommand );
