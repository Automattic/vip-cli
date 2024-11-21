#!/usr/bin/env node

import chalk from 'chalk';
import { setTimeout } from 'timers/promises';

import * as slowlogsLib from '../lib/app-slowlogs/app-slowlogs';
import {
	BaseTrackingParams,
	DefaultOptions,
	GetBaseTrackingParamsOptions,
	GetSlowLogsOptions,
	Slowlog,
	SlowlogFormats,
} from '../lib/app-slowlogs/types';
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { OutputFormat, formatData } from '../lib/cli/format';
import { trackEvent } from '../lib/tracker';

const LIMIT_MIN = 1;
const LIMIT_MAX = 500;
const ALLOWED_FORMATS: OutputFormat[] = [ 'csv', 'json', 'table' ];
const DEFAULT_POLLING_DELAY_IN_SECONDS = 30;
const MIN_POLLING_DELAY_IN_SECONDS = 5;
const MAX_POLLING_DELAY_IN_SECONDS = 300;

const exampleUsage = 'vip @example-app.develop slowlogs';
const baseUsage = 'vip slowlogs';

export async function getSlowlogs( arg: string[], opt: GetSlowLogsOptions ): Promise< void > {
	opt.format ??= 'table';
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
			`Invalid limit: ${ limit }. Set the limit to an integer between ${ LIMIT_MIN } and ${ slowlogsLib.LIMIT_MAX }.`
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
	format: false,
	module: 'slowlogs',
	usage: baseUsage,
} )
	.option(
		'limit',
		'Set the maximum number of log entries. Accepts an integer value between 1 and 500.',
		500
	)
	.option( 'format', 'Render output in a particular format. Accepts “csv”, and “json”.', 'table' )
	.examples( [
		{
			description:
				'Retrieve up to 500 of the most recent entries from the MySQL slow query logs in the default format.',
			usage: exampleUsage,
		},
		{
			description:
				'Retrieve up to 50 of the most recent entries from the MySQL slow query logs in the default format.',
			usage: `${ exampleUsage } --limit=50`,
		},
		{
			description:
				'Retrieve up to 100 of the most recent entries from the MySQL slow query logs in CSV format.',
			usage: `${ exampleUsage } --limit=100 --format=csv`,
		},
		{
			description:
				'Retrieve up to 100 of the most recent entries from the MySQL slow query logs in JSON format.',
			usage: `${ exampleUsage } --limit=100 --format=json`,
		},
	] )
	.argv( process.argv, getSlowlogs );
