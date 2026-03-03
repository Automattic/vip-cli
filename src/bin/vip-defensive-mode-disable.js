#!/usr/bin/env node

import chalk from 'chalk';

import { appQuery, disableDefensiveMode } from '../lib/api/defensive-mode';
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { confirm } from '../lib/cli/prompt';
import { trackEvent } from '../lib/tracker';

const usage = 'vip defensive-mode disable';
const exampleUsage = 'vip @example-app.develop defensive-mode disable';

const examples = [
	{
		usage: exampleUsage,
		description: 'Disable Defensive Mode for the specified environment (interactive).',
	},
	{
		usage: `${ exampleUsage } --confirm`,
		description: 'Disable Defensive Mode without confirmation prompt (for automation).',
	},
	{
		usage: `${ exampleUsage } --format=json`,
		description: 'Disable Defensive Mode with JSON output.',
	},
];

export async function defensiveModeDisableCommand( arg, opt = {} ) {
	const trackingParams = {
		app_id: opt.app.id,
		command: 'vip defensive-mode disable',
		env_id: opt.env.id,
	};

	await trackEvent( 'defensive_mode_disable_command_execute', trackingParams );

	// Confirmation prompt (unless --confirm flag is provided)
	if ( ! opt.confirm ) {
		const primaryDomain = opt.env.primaryDomain?.name || opt.app.name;
		console.log( chalk.yellow( '⚠  Warning' ) );
		console.log(
			`You are about to disable Defensive Mode for ${ chalk.bold( opt.app.name ) } (${ chalk.bold( opt.env.name ) })`
		);
		console.log( `This will remove bot/DDoS protection from https://${ primaryDomain }` );
		console.log();

		const confirmed = await confirm( "Type 'DISABLE' to confirm:", 'DISABLE' );

		if ( ! confirmed ) {
			console.log( chalk.red( 'Operation cancelled.' ) );
			process.exit( 0 );
		}
	}

	let result;
	try {
		result = await disableDefensiveMode( opt.app.id, opt.env.id );
	} catch ( err ) {
		await trackEvent( 'defensive_mode_disable_command_error', {
			...trackingParams,
			error: err.message,
		} );

		exit.withError( `Failed to disable Defensive Mode: ${ err.message }` );
	}

	await trackEvent( 'defensive_mode_disable_command_success', trackingParams );

	// JSON output format
	if ( opt.format === 'json' ) {
		console.log( JSON.stringify( result, null, 2 ) );
		return;
	}

	// Table output format (default)
	const wasDisabled = result.data.statusUpdated === false;

	console.log();
	console.log(
		chalk.green(
			`✓ Defensive Mode ${ wasDisabled ? 'already ' : '' }disabled for ${ opt.app.name } (${ opt.env.name })`
		)
	);
	console.log();
	console.log( `Status: ${ chalk.bold( 'INACTIVE' ) }` );
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	usage,
} )
	.option( 'confirm', 'Skip confirmation prompt (for automation)' )
	.option( 'format', 'Output format: table (default) or json' )
	.examples( examples )
	.argv( process.argv, defensiveModeDisableCommand );
