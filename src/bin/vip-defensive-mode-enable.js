#!/usr/bin/env node

import chalk from 'chalk';

import { appQuery, enableDefensiveMode } from '../lib/api/defensive-mode';
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { trackEvent } from '../lib/tracker';

const usage = 'vip defensive-mode enable';
const exampleUsage = 'vip @example-app.develop defensive-mode enable';

const examples = [
	{
		usage: exampleUsage,
		description: 'Enable Defensive Mode for the specified environment.',
	},
	{
		usage: `${ exampleUsage } --format=json`,
		description: 'Enable Defensive Mode with JSON output (for automation).',
	},
];

export async function defensiveModeEnableCommand( arg, opt = {} ) {
	const trackingParams = {
		app_id: opt.app.id,
		command: 'vip defensive-mode enable',
		env_id: opt.env.id,
	};

	await trackEvent( 'defensive_mode_enable_command_execute', trackingParams );

	let result;
	try {
		result = await enableDefensiveMode( opt.app.id, opt.env.id );
	} catch ( err ) {
		await trackEvent( 'defensive_mode_enable_command_error', {
			...trackingParams,
			error: err.message,
		} );

		exit.withError( `Failed to enable Defensive Mode: ${ err.message }` );
	}

	await trackEvent( 'defensive_mode_enable_command_success', trackingParams );

	// JSON output format
	if ( opt.format === 'json' ) {
		console.log( JSON.stringify( result, null, 2 ) );
		return;
	}

	// Table output format (default)
	const config = result.data.effective;
	const wasEnabled = result.data.statusUpdated === false;
	const envName = opt.env.type || opt.env.name;

	console.log(
		chalk.green(
			`✓ Defensive Mode ${ wasEnabled ? 'already ' : '' }enabled for ${ opt.app.name } (${ envName })`
		)
	);
	console.log();
	console.log( `Status:  ${ chalk.bold( 'ACTIVE' ) }` );

	if (
		config.connectionThresholdPercentage !== undefined &&
		config.connectionThresholdPercentage !== null
	) {
		console.log( `Threshold: ${ config.connectionThresholdPercentage }% PHP workers` );
	} else if (
		config.connectionThresholdAbsolute !== undefined &&
		config.connectionThresholdAbsolute !== null
	) {
		console.log( `Threshold: ${ config.connectionThresholdAbsolute } concurrent requests` );
	}
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	usage,
} )
	.option( 'format', 'Output format: table (default) or json' )
	.examples( examples )
	.argv( process.argv, defensiveModeEnableCommand );
