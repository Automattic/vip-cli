#!/usr/bin/env node

import command from '../lib/cli/command';
import { DEV_ENVIRONMENT_FULL_COMMAND } from '../lib/constants/dev-environment';
import {
	handleCLIException,
	validateDependencies,
} from '../lib/dev-environment/dev-environment-cli';
import { printAllEnvironmentsInfo } from '../lib/dev-environment/dev-environment-core';
import { bootstrapLando } from '../lib/dev-environment/dev-environment-lando';
import { trackEvent } from '../lib/tracker';

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } list`,
		description: 'Return information about all local dev environments',
	},
];

command()
	.examples( examples )
	.argv( process.argv, async () => {
		const lando = await bootstrapLando();
		lando.events.constructor.prototype.setMaxListeners( 1024 );
		await validateDependencies( lando, '' );

		const trackingInfo = { all: true };
		await trackEvent( 'dev_env_list_command_execute', trackingInfo );

		try {
			await printAllEnvironmentsInfo( lando, {} );
			await trackEvent( 'dev_env_list_command_success', trackingInfo );
		} catch ( error ) {
			await handleCLIException( error, 'dev_env_list_command_error', trackingInfo );
			process.exitCode = 1;
		}
	} );
