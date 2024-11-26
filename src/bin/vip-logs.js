#!/usr/bin/env node

import chalk from 'chalk';
import CliTable3 from 'cli-table3';
import { setTimeout } from 'timers/promises';

import * as logsLib from '../lib/app-logs/app-logs';
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { formatData } from '../lib/cli/format';
import { trackEvent } from '../lib/tracker';

const LIMIT_MIN = 1;
const LIMIT_MAX = 5000;
const LIMIT_DEFAULT = 500;
const ALLOWED_TYPES = [ 'app', 'batch' ];
const ALLOWED_FORMATS = [ 'csv', 'json', 'table', 'text' ];
const DEFAULT_POLLING_DELAY_IN_SECONDS = 30;
const MIN_POLLING_DELAY_IN_SECONDS = 5;
const MAX_POLLING_DELAY_IN_SECONDS = 300;

/**
 * @param {string[]} arg
 */
export async function getLogs( arg, opt ) {
	opt.type ??= 'app';
	opt.limit ??= LIMIT_DEFAULT;
	opt.format ??= 'table';

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
	if ( 'table' === format ) {
		const options = {
			wordWrap: true,
			wrapOnWordBoundary: true,
			head: [ 'Timestamp', 'Message' ],
			style: {
				head: [ 'cyan' ],
				border: [ 'grey' ],
			},
		};

		if ( process.stdout.isTTY && process.stdout.columns ) {
			options.colWidths = [
				'YYYY-MM-DDTHH:MM:SS.nnnnnnnnnZ'.length + 2 /* padding */,
				Math.max(
					process.stdout.columns - '│  │  │'.length - 'YYYY-MM-DDTHH:MM:SS.nnnnnnnnnZ'.length,
					20
				),
			];
		} else {
			options.style.head = [];
			options.style.border = [];
		}

		const table = new CliTable3( options );
		for ( const { timestamp, message } of logs ) {
			const msg = message.trimRight().replace( /\t/g, '    ' );
			table.push( [ timestamp, msg ] );
		}

		output = table.toString();
	} else if ( 'text' === format ) {
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
			`Invalid limit: ${ limit }. Set the limit to an integer between ${ LIMIT_MIN } and ${ logsLib.LIMIT_MAX }.`
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
	.option(
		'type',
		'Specify the type of Runtime Logs to retrieve. Accepts "batch" (only valid for WordPress environments).',
		'app'
	)
	// The default limit is set manually in the validateInputs function to address validation issues, avoiding incorrect replacement of the default value.
	.option(
		'limit',
		`The maximum number of entries to return. Accepts an integer value between 1 and 5000 (defaults to ${ LIMIT_DEFAULT }).`
	)
	.option( 'follow', 'Output new entries as they are generated.' )
	.option( 'format', 'Render output in a particular format. Accepts “csv”, “json”, and “text”.', 'table' )
	.examples( [
		{
			usage: 'vip @example-app.production logs',
			description:
				'Retrieve up to 500 of the most recent entries of application Runtime Logs from web containers.',
		},
		{
			usage: 'vip @example-app.production logs --type=batch',
			description:
				'Retrieve up to 500 of the most recent entries generated by cron tasks or WP-CLI commands from batch containers.',
		},
		{
			usage: 'vip @example-app.production logs --limit=100',
			description: 'Retrieve up to 100 of the most recent entries of application logs.',
		},
		{
			usage: 'vip @example-app.production logs --type=batch --limit=800 --format=csv',
			description:
				'Retrieve up to 800 of the most recent entries of batch logs and output them in CSV format.',
		},
	] )
	.argv( process.argv, getLogs );
