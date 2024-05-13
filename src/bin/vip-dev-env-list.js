#!/usr/bin/env node

import command from '../lib/cli/command';
import {
	handleCLIException,
	validateDependencies,
} from '../lib/dev-environment/dev-environment-cli';
import { printAllEnvironmentsInfo } from '../lib/dev-environment/dev-environment-core';
import { bootstrapLando } from '../lib/dev-environment/dev-environment-lando';
import { trackEvent } from '../lib/tracker';

const exampleUsage = 'vip dev-env list';
const usage = 'vip dev-env list';

const examples = [
	{
		usage: `${ exampleUsage } list`,
		description: 'Retrieve basic information about all local environments.',
	},
];

command( {
	usage,
})
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
