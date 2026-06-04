#!/usr/bin/env node

import command from '../lib/cli/command';
import { formatEnvironment } from '../lib/cli/format';
import { appQuery, updateDefensiveModeStatus } from '../lib/defensive-mode/api';
import { guardProductionMutation, reportMutationResult } from '../lib/defensive-mode/cli-helpers';
import { confirm } from '../lib/envvar/input';
import { trackEvent } from '../lib/tracker';

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

	await guardProductionMutation(
		opt,
		'enable',
		trackingParams,
		confirm,
		trackEvent,
		formatEnvironment
	);

	const result = await updateDefensiveModeStatus( {
		appId: opt.app.id,
		envId: opt.env.id,
		enabled: true,
	} );

	await reportMutationResult(
		result,
		trackingParams,
		'enable',
		opt.app.name,
		opt.env.type,
		'enabled',
		'enable defensive mode',
		trackEvent
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
