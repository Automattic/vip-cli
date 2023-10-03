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
import * as slowlogsLib from '../lib/app-slowlogs/app-slowlogs';
import * as exit from '../lib/cli/exit';
import { formatData } from '../lib/cli/format';
import {
	BaseTrackingParams,
	DefaultOptions,
	GetBaseTrackingParamsOptions,
	GetSlowLogsOptions,
	Slowlog,
	SlowlogFormats,
} from '../lib/app-slowlogs/types';

const LIMIT_MIN = 1;
const LIMIT_MAX = 500;
const ALLOWED_FORMATS = [ 'csv', 'json', 'text' ];
const DEFAULT_POLLING_DELAY_IN_SECONDS = 30;
const MIN_POLLING_DELAY_IN_SECONDS = 5;
const MAX_POLLING_DELAY_IN_SECONDS = 300;

export async function getSlowlogs( arg: string[], opt: GetSlowLogsOptions ): Promise< void > {
	validateInputs( opt.limit, opt.format );

	const trackingParams = getBaseTrackingParams( opt );

	await trackEvent( 'slowlogs_command_execute', trackingParams );

	let slowlogs;
	try {
		slowlogs = await slowlogsLib.getRecentSlowlogs( opt.app.id, opt.env.id, opt.limit );
	} catch ( error: unknown ) {
		const err = error as Error;
		await trackEvent( 'slowlogs_command_error', { ...trackingParams, error: err.message } );

		return exit.withError( err.message );
	}

	await trackEvent( 'slowlogs_command_success', {
		...trackingParams,
		total: slowlogs.nodes.length,
	} );

	if ( ! slowlogs.nodes.length ) {
		console.error( 'No logs found' );
		return;
	}

	printSlowlogs( slowlogs.nodes, opt.format );
}

interface FollowLogsOptions extends DefaultOptions {
	limit: number;
	format: SlowlogFormats;
}

export async function followLogs( opt: FollowLogsOptions ): Promise< void > {
	let after = null;
	let isFirstRequest = true;
	// How many times have we polled?
	let requestNumber = 0;

	const trackingParams = getBaseTrackingParams( opt );

	// Set an initial default delay
	let delay = DEFAULT_POLLING_DELAY_IN_SECONDS;

	// eslint-disable-next-line no-constant-condition, @typescript-eslint/no-unnecessary-condition
	while ( true ) {
		const limit = isFirstRequest ? opt.limit : LIMIT_MAX;

		requestNumber++;
		trackingParams.request_number = requestNumber;
		trackingParams.request_delay = delay;
		trackingParams.limit = limit;

		let slowlogs;
		try {
			// eslint-disable-next-line no-await-in-loop
			slowlogs = await slowlogsLib.getRecentSlowlogs( opt.app.id, opt.env.id, limit, after );

			// eslint-disable-next-line no-await-in-loop
			await trackEvent( 'slowlogs_command_follow_success', {
				...trackingParams,
				total: slowlogs.nodes.length,
			} );
		} catch ( error: unknown ) {
			const err = error as Error;
			// eslint-disable-next-line no-await-in-loop
			await trackEvent( 'slowlogs_command_follow_error', {
				...trackingParams,
				error: err.message,
			} );

			// If the first request fails we don't want to retry (it's probably not recoverable)
			if ( isFirstRequest ) {
				console.error( `${ chalk.red( 'Error:' ) } Failed to fetch slowlogs.` );
				break;
			}
			// Increase the delay on errors to avoid overloading the server, up to a max of 5 minutes
			delay += DEFAULT_POLLING_DELAY_IN_SECONDS;
			delay = Math.min( delay, MAX_POLLING_DELAY_IN_SECONDS );
			console.error(
				`${ chalk.red( 'Error:' ) } Failed to fetch slowlogs. Trying again in ${ delay } seconds.`
			);
		}

		if ( slowlogs ) {
			if ( slowlogs.nodes.length ) {
				printSlowlogs( slowlogs.nodes, opt.format );
			}

			after = slowlogs.nextCursor;
			isFirstRequest = false;

			// Keep a sane lower limit of MIN_POLLING_DELAY_IN_SECONDS just in case something goes wrong in the server-side
			delay = Math.max(
				slowlogs.pollingDelaySeconds || DEFAULT_POLLING_DELAY_IN_SECONDS,
				MIN_POLLING_DELAY_IN_SECONDS
			);
		}

		// eslint-disable-next-line no-await-in-loop
		await setTimeout( delay * 1000 );
	}
}

function getBaseTrackingParams( opt: GetBaseTrackingParamsOptions ): BaseTrackingParams {
	return {
		command: 'vip slowlogs',
		org_id: opt.app.organization.id,
		app_id: opt.app.id,
		env_id: opt.env.id,
		limit: opt.limit,
		follow: opt.follow ?? false,
		format: opt.format,
	};
}

function printSlowlogs( slowlogs: Slowlog[], format: SlowlogFormats ): void {
	// Strip out __typename
	slowlogs = slowlogs.map( log => {
		const { timestamp, rowsSent, rowsExamined, queryTime, requestUri, query } = log;

		return { timestamp, rowsSent, rowsExamined, queryTime, requestUri, query };
	} );

	console.log( formatData( slowlogs, format ) );
}

export function validateInputs( limit: number, format: SlowlogFormats ): void {
	if ( ! ALLOWED_FORMATS.includes( format ) ) {
		exit.withError(
			`Invalid format: ${ format }. The supported formats are: ${ ALLOWED_FORMATS.join( ', ' ) }.`
		);
	}

	if ( ! Number.isInteger( limit ) || limit < LIMIT_MIN || limit > slowlogsLib.LIMIT_MAX ) {
		exit.withError(
			`Invalid limit: ${ limit }. It should be a number between ${ LIMIT_MIN } and ${ slowlogsLib.LIMIT_MAX }.`
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

void command( {
	appContext: true,
	appQuery,
	envContext: true,
	format: true,
	module: 'slowlogs',
} )
	.option( 'limit', 'The maximum number of log lines', 500 )
	.option( 'format', 'Output the log lines in CSV or JSON format', 'text' )
	.examples( [
		{
			description: 'Get the most recent app slowlogs',
			usage: 'vip @mysite.production slowlogs',
		},
		{
			usage: 'vip @mysite.production slowlogs --limit 100',
			description: 'Get the most recent 100 slowlog entries',
		},
		{
			usage: 'vip @mysite.production slowlogs --limit 100 --format csv',
			description:
				'Get the most recent 100 slowlog entries formatted as comma-separated values (CSV)',
		},
		{
			usage: 'vip @mysite.production slowlogs --limit 100 --format json',
			description: 'Get the most recent 100 slowlog entries formatted as JSON',
		},
	] )
	.argv( process.argv, getSlowlogs );
