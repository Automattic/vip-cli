#!/usr/bin/env node

import chalk from 'chalk';

import command from '../lib/cli/command';
import { formatEnvironment } from '../lib/cli/format';
import { appQuery, updateDefensiveModeStatus } from '../lib/defensive-mode/api';
import { confirm } from '../lib/envvar/input';
import { trackEvent } from '../lib/tracker';

const baseUsage = 'vip defensive-mode disable';
const exampleUsage = 'vip @example-app.production defensive-mode disable';

const examples = [
	{
		usage: exampleUsage,
		description: 'Disable defensive mode for the environment.',
	},
];

export async function defensiveModeDisableCommand( _args, opt ) {
	const trackingParams = {
		app_id: opt.app.id,
		command: baseUsage,
		env_id: opt.env.id,
		org_id: opt.app.organization.id,
		org_sfid: opt.app.organization.salesforceId,
		skip_confirm: Boolean( opt.skipConfirmation ),
	};

	await trackEvent( 'defensive_mode_disable_command_execute', trackingParams );

	if ( ! opt.skipConfirmation && opt.env.type === 'production' ) {
		const yes = await confirm(
			`Disable defensive mode on ${ formatEnvironment( opt.env.type ) } for ${ opt.app.name }?`
		);
		if ( ! yes ) {
			await trackEvent( 'defensive_mode_disable_command_cancelled', trackingParams );
			console.log( 'Command cancelled' );
			process.exit();
		}
	}

	const result = await updateDefensiveModeStatus( {
		appId: opt.app.id,
		envId: opt.env.id,
		enabled: false,
	} );

	if ( ! result.success ) {
		await trackEvent( 'defensive_mode_disable_command_error', {
			...trackingParams,
			error: result.message,
		} );
		console.log( chalk.red( `Failed to disable defensive mode: ${ result.message }` ) );
		process.exit( 1 );
	}

	await trackEvent( 'defensive_mode_disable_command_success', trackingParams );
	console.log(
		chalk.green( '✓' ),
		`Defensive mode disabled for ${ opt.app.name }.${ opt.env.type } — ${ result.message }`
	);
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	usage: baseUsage,
} )
	.option( 'skip-confirmation', 'Skip the confirmation prompt for production envs.', false )
	.examples( examples )
	.argv( process.argv, defensiveModeDisableCommand );
