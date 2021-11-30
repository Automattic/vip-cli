#!/usr/bin/env node
// @flow
/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { rollbar } from 'lib/rollbar';
import { trackEvent } from 'lib/tracker';
import * as logsLib from 'lib/logs/logs';
import * as exit from 'lib/cli/exit';

const LIMIT_MAX = 5000;
const LIMIT_MIN = 1;
const ALLOWED_TYPES = [ 'app', 'batch' ];

export async function getLogs( arg: string[], opt ): Promise<void> {
	validateInputs( opt.type, opt.limit, opt.env );

	const trackingParams = {
		command: 'vip logs',
		org_id: opt.app.organization.id,
		app_id: opt.app.id,
		env_id: opt.env.id,
		type: opt.type,
		limit: opt.limit,
	};

	await trackEvent( 'logs_command_execute', trackingParams );

	try {
		const logs = await logsLib.getRecentLogs( opt.app.id, opt.env.id, opt.type, opt.limit );

		for ( const { timestamp, message } of logs ) {
			console.log( `${ timestamp } ${ message }` );
		}
	} catch ( error ) {
		rollbar.error( error );

		await trackEvent( 'logs_command_error', { ...trackingParams, error: error.message } );

		return exit.withError( error.message );
	}

	await trackEvent( 'logs_command_success', trackingParams );
}

export function validateInputs( type: string, limit: number, env: Object ): void {
	if ( ! env.isK8sResident ) {
		exit.withError( '`vip logs` is not supported for the specified environment.' );
	}

	if ( ! ALLOWED_TYPES.includes( type ) ) {
		exit.withError( `Invalid type: ${ type }. The supported types are: ${ ALLOWED_TYPES.join( ', ' ) }.` );
	}

	if ( ! Number.isInteger( limit ) || limit < LIMIT_MIN || limit > LIMIT_MAX ) {
		exit.withError( `Invalid limit: ${ limit }. It should be a number between ${ LIMIT_MIN } and ${ LIMIT_MAX }.` );
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
		isK8sResident
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
			description: 'Get the most recent 100 logs',
		},
	] )
	.argv( process.argv, getLogs );
