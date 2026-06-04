#!/usr/bin/env node

import chalk from 'chalk';

import command from '../lib/cli/command';
import { formatEnvironment } from '../lib/cli/format';
import { appQuery, updateDefensiveModeStatus } from '../lib/defensive-mode/api';
import { confirm } from '../lib/envvar/input';
import { trackEvent } from '../lib/tracker';

function isInteractive( opt ) {
	if ( process.env.VIP_NON_INTERACTIVE === '1' ) return false;
	if ( opt.nonInteractive ) return false;
	return Boolean( process.stdout.isTTY );
}

const baseUsage = 'vip defensive-mode enable';
const exampleUsage = 'vip @example-app.production defensive-mode enable';

const examples = [
	{
		usage: exampleUsage,
		description: 'Enable defensive mode for the environment (interactive).',
	},
	{
		usage: `${ exampleUsage } --skip-confirmation`,
		description: 'Enable defensive mode without the production confirmation prompt.',
	},
];

export async function defensiveModeEnableCommand( _args, opt ) {
	const trackingParams = {
		app_id: opt.app.id,
		command: baseUsage,
		env_id: opt.env.id,
		org_id: opt.app.organization.id,
		org_sfid: opt.app.organization.salesforceId,
		skip_confirm: Boolean( opt.skipConfirmation ),
	};

	await trackEvent( 'defensive_mode_enable_command_execute', trackingParams );

	if ( ! opt.skipConfirmation && opt.env.type === 'production' ) {
		if ( ! isInteractive( opt ) ) {
			console.error(
				chalk.red(
					'Refusing to enable defensive mode on production without confirmation. ' +
						'Pass --skip-confirmation to proceed non-interactively.'
				)
			);
			await trackEvent( 'defensive_mode_enable_command_cancelled', trackingParams );
			process.exit( 1 );
		}
		const yes = await confirm(
			`Enable defensive mode on ${ formatEnvironment( opt.env.type ) } for ${ opt.app.name }?`
		);
		if ( ! yes ) {
			await trackEvent( 'defensive_mode_enable_command_cancelled', trackingParams );
			console.log( 'Command cancelled' );
			process.exit();
		}
	}

	const result = await updateDefensiveModeStatus( {
		appId: opt.app.id,
		envId: opt.env.id,
		enabled: true,
	} );

	if ( ! result.success ) {
		await trackEvent( 'defensive_mode_enable_command_error', {
			...trackingParams,
			error: result.message,
		} );
		console.error( chalk.red( `Failed to enable defensive mode: ${ result.message }` ) );
		process.exit( 1 );
	}

	await trackEvent( 'defensive_mode_enable_command_success', trackingParams );
	console.log(
		chalk.green( '✓' ),
		`Defensive mode enabled for ${ opt.app.name }.${ opt.env.type } — ${ result.message }`
	);
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	usage: baseUsage,
} )
	.option( 'skip-confirmation', 'Skip the confirmation prompt for production envs.', false )
	.option(
		'non-interactive',
		'Disable prompts; error if a production mutation is attempted without --skip-confirmation.',
		false
	)
	.examples( examples )
	.argv( process.argv, defensiveModeEnableCommand );
