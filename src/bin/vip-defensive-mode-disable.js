#!/usr/bin/env node

import command from '../lib/cli/command';
import { formatEnvironment } from '../lib/cli/format';
import { appQuery, updateDefensiveModeStatus } from '../lib/defensive-mode/api';
import { guardProductionMutation, reportMutationResult } from '../lib/defensive-mode/cli-helpers';
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

	await guardProductionMutation(
		opt,
		'disable',
		trackingParams,
		confirm,
		trackEvent,
		formatEnvironment
	);

	const result = await updateDefensiveModeStatus( {
		appId: opt.app.id,
		envId: opt.env.id,
		enabled: false,
	} );

	await reportMutationResult(
		result,
		trackingParams,
		'disable',
		opt.app.name,
		opt.env.type,
		'disabled',
		'disable defensive mode',
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
	.argv( process.argv, defensiveModeDisableCommand );
