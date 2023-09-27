#!/usr/bin/env node

/**
 * External dependencies
 */
import chalk from 'chalk';
import { setTimeout } from 'timers/promises';

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import { trackEvent } from '../lib/tracker';
import * as logsLib from '../lib/app-logs/app-logs';
import * as exit from '../lib/cli/exit';
import { formatData } from '../lib/cli/format';

const LIMIT_MIN = 1;
const LIMIT_MAX = 5000;
const ALLOWED_TYPES = [ 'app', 'batch' ];
const ALLOWED_FORMATS = [ 'csv', 'json', 'text' ];
const DEFAULT_POLLING_DELAY_IN_SECONDS = 30;
const MIN_POLLING_DELAY_IN_SECONDS = 5;
const MAX_POLLING_DELAY_IN_SECONDS = 300;

/**
 * @param {string[]} arg
 */
export async function getLogs( arg, opt ) {
	validateInputs( opt.type, opt.limit, opt.format );

	const trackingParams = getBaseTrackingParams( opt );

	await trackEvent( 'logs_command_execute', trackingParams );

	let logs;
	try {
		if ( opt.follow ) {
			return await followLogs( opt );
		}

		logs = await logsLib.getRecentLogs( opt.app.id, opt.env.id, opt.type, opt.limit );
	} catch ( error ) {
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

export async function followLogs( opt ) {
	let after = null;
	let isFirstRequest = true;
	// How many times have we polled?
	let requestNumber = 0;

	const trackingParams = getBaseTrackingParams( opt );

	// Set an initial default delay
	let delay = DEFAULT_POLLING_DELAY_IN_SECONDS;

	// eslint-disable-next-line no-constant-condition
	while ( true ) {
		const limit = isFirstRequest ? opt.limit : LIMIT_MAX;

		requestNumber++;
		trackingParams.request_number = requestNumber;
		trackingParams.request_delay = delay;
		trackingParams.limit = limit;

		let logs;
		try {
			// eslint-disable-next-line no-await-in-loop
			logs = await logsLib.getRecentLogs( opt.app.id, opt.env.id, opt.type, limit, after );

			// eslint-disable-next-line no-await-in-loop
			await trackEvent( 'logs_command_follow_success', {
				...trackingParams,
				total: logs?.nodes.length,
			} );
		} catch ( error ) {
			// eslint-disable-next-line no-await-in-loop
			await trackEvent( 'logs_command_follow_error', { ...trackingParams, error: error.message } );

			// If the first request fails we don't want to retry (it's probably not recoverable)
			if ( isFirstRequest ) {
				console.error( `${ chalk.red( 'Error:' ) } Failed to fetch logs.` );
				break;
			}
			// Increase the delay on errors to avoid overloading the server, up to a max of 5 minutes
			delay += DEFAULT_POLLING_DELAY_IN_SECONDS;
			delay = Math.min( delay, MAX_POLLING_DELAY_IN_SECONDS );
			console.error(
				`${ chalk.red( 'Error:' ) } Failed to fetch logs. Trying again in ${ delay } seconds.`
			);
		}

		if ( logs ) {
			if ( logs?.nodes.length ) {
				printLogs( logs.nodes, opt.format );
			}

			after = logs?.nextCursor;
			isFirstRequest = false;

			// Keep a sane lower limit of MIN_POLLING_DELAY_IN_SECONDS just in case something goes wrong in the server-side
			delay = Math.max(
				logs?.pollingDelaySeconds || DEFAULT_POLLING_DELAY_IN_SECONDS,
				MIN_POLLING_DELAY_IN_SECONDS
			);
		}

		// eslint-disable-next-line no-await-in-loop
		await setTimeout( delay * 1000 );
	}
}

function getBaseTrackingParams( opt ) {
	return {
		command: 'vip logs',
		org_id: opt.app.organization.id,
		app_id: opt.app.id,
		env_id: opt.env.id,
		type: opt.type,
		limit: opt.limit,
		follow: opt.follow || false,
		format: opt.format,
	};
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

/**
 * @param {string} type
 * @param {number} limit
 * @param {string} format
 */
export function validateInputs( type, limit, format ) {
	if ( ! ALLOWED_TYPES.includes( type ) ) {
		exit.withError(
			`Invalid type: ${ type }. The supported types are: ${ ALLOWED_TYPES.join( ', ' ) }.`
		);
	}

	if ( ! ALLOWED_FORMATS.includes( format ) ) {
		exit.withError(
			`Invalid format: ${ format }. The supported formats are: ${ ALLOWED_FORMATS.join( ', ' ) }.`
		);
	}

	if ( ! Number.isInteger( limit ) || limit < LIMIT_MIN || limit > logsLib.LIMIT_MAX ) {
		exit.withError(
			`Invalid limit: ${ limit }. It should be a number between ${ LIMIT_MIN } and ${ logsLib.LIMIT_MAX }.`
		);
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
