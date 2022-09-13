#!/usr/bin/env node

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { trackEvent } from 'lib/tracker';
import command from 'lib/cli/command';
import { printAllEnvironmentsInfo } from 'lib/dev-environment/dev-environment-core';
import { handleCLIException } from 'lib/dev-environment/dev-environment-cli';
import { DEV_ENVIRONMENT_FULL_COMMAND } from 'lib/constants/dev-environment';
import { validateDependencies } from '../lib/dev-environment/dev-environment-cli';

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } list`,
		description: 'Return information about all local dev environments',
	},
];

command()
	.examples( examples )
	.argv( process.argv, async () => {
		await validateDependencies();
		const trackingInfo = { all: true };
		await trackEvent( 'dev_env_list_command_execute', trackingInfo );

		try {
			await printAllEnvironmentsInfo();
			await trackEvent( 'dev_env_list_command_success', trackingInfo );
		} catch ( error ) {
			handleCLIException( error, 'dev_env_list_command_error', trackingInfo );
		}
	} );
