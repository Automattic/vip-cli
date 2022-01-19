#!/usr/bin/env node
// @flow
/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { rollbar } from 'lib/rollbar';
import { trackEvent } from 'lib/tracker';
import * as logsLib from 'lib/app-logs/app-logs';
import * as exit from 'lib/cli/exit';
import { formatData } from 'lib/cli/format';

const LIMIT_MIN = 1;
const ALLOWED_TYPES = [ 'app', 'batch' ];
const ALLOWED_FORMATS = [ 'csv', 'json', 'text' ];
const MIN_POLLING_DELAY_SECONDS = 5;

export async function getLogs( arg: string[], opt ): Promise<void> {
	validateInputs( opt.type, opt.limit, opt.format );

	const trackingParams = {
		command: 'vip logs',
		org_id: opt.app.organization.id,
		app_id: opt.app.id,
		env_id: opt.env.id,
		type: opt.type,
		limit: opt.limit,
		follow: opt.follow || false,
		format: opt.format,
	};

	await trackEvent( 'logs_command_execute', trackingParams );

	let logs;
	try {
		if ( opt.follow ) {
			return await followLogs( opt );
		}

		logs = await logsLib.getRecentLogs( opt.app.id, opt.env.id, opt.type, opt.limit );
	} catch ( error ) {
		rollbar.error( error );

		await trackEvent( 'logs_command_error', { ...trackingParams, error: error.message } );

		return exit.withError( error.message );
	}

	await trackEvent( 'logs_command_success', {
		...trackingParams,
		total: logs.nodes.length,
	} );

	if ( ! logs.nodes.length ) {
		console.error( 'No logs found' );
		return;
	}

	printLogs( logs.nodes, opt.format );
}

export async function followLogs( opt ): Promise<void> {
	let after = null;
	let isFirstRequest = true;

	// Set an initial default delay
	let delay = 30;

	while ( true ) {
		const limit = isFirstRequest ? opt.limit : 5000;

		let logs;
		try {
			logs = await logsLib.getRecentLogs( opt.app.id, opt.env.id, opt.type, limit, after );
		} catch ( error ) {
			// Increase the delay on errors to avoid overloading the server, up to a max of 5 minutes
			delay += 30;
			delay = Math.max( delay, 300 );
			console.error( `Failed to fetch logs. Trying again in ${ delay } seconds` );
			rollbar.error( error );
		}

		if ( logs ) {
			if ( logs?.nodes.length ) {
				printLogs( logs.nodes, opt.format );
			}

			after = logs?.nextCursor;
			isFirstRequest = false;

			// Keep a sane lower limit of MIN_POLLING_DELAY_SECONDS just in case something goes wrong in the server-side
			delay = Math.max( ( logs?.pollingDelaySeconds || 30 ), MIN_POLLING_DELAY_SECONDS );
		}

		await new Promise( resolve => setTimeout( resolve, delay * 1000 ) );
	}
}

function printLogs( logs, format ) {
	// Strip out __typename
	logs = logs.map( log => {
		const { timestamp, message } = log;

		return { timestamp, message };
	} );

	let output = '';
	if ( format && 'text' === format ) {
		const rows = [];
		for ( const { timestamp, message } of logs ) {
			rows.push( `${ timestamp } ${ message }` );
			output = rows.join( '\n' );
		}
	} else {
		output = formatData( logs, format );
	}

	console.log( output );
}

export function validateInputs( type: string, limit: number, format: string ): void {
	if ( ! ALLOWED_TYPES.includes( type ) ) {
		exit.withError( `Invalid type: ${ type }. The supported types are: ${ ALLOWED_TYPES.join( ', ' ) }.` );
	}

	if ( ! ALLOWED_FORMATS.includes( format ) ) {
		exit.withError( `Invalid format: ${ format }. The supported formats are: ${ ALLOWED_FORMATS.join( ', ' ) }.` );
	}

	if ( ! Number.isInteger( limit ) || limit < LIMIT_MIN || limit > logsLib.LIMIT_MAX ) {
		exit.withError( `Invalid limit: ${ limit }. It should be a number between ${ LIMIT_MIN } and ${ logsLib.LIMIT_MAX }.` );
	}
}

export const appQuery = `
	id
	name
	environments {
		id
		appId
		name
		type
	}
	organization {
		id
		name
	}
`;

command( {
	appContext: true,
	appQuery,
	envContext: true,
	module: 'logs',
} )
	.option( 'type', 'The type of logs to be returned: "app" or "batch"', 'app' )
	.option( 'limit', 'The maximum number of log lines', 500 )
	.option( 'follow', 'Keep fetching new logs as they are generated' )
	.option( 'format', 'Output the log lines in CSV or JSON format', 'text' )
	.examples( [
		{
			usage: 'vip @mysite.production logs',
			description: 'Get the most recent app logs',
		},
		{
			usage: 'vip @mysite.production logs --type batch',
			description: 'Get the most recent batch logs',
		},
		{
			usage: 'vip @mysite.production logs --limit 100',
			description: 'Get the most recent 100 log entries',
		},
		{
			usage: 'vip @mysite.production logs --limit 100 --format csv',
			description: 'Get the most recent 100 log entries formatted as comma-separated values (CSV)',
		},
		{
			usage: 'vip @mysite.production logs --limit 100 --format json',
			description: 'Get the most recent 100 log entries formatted as JSON',
		},
	] )
	.argv( process.argv, getLogs );
