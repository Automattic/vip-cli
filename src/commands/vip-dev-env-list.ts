import { EventEmitter } from 'node:events';

import command from '../lib/cli/command';
import {
	handleCLIException,
	validateDependencies,
	getDevEnvLogFile,
} from '../lib/dev-environment/dev-environment-cli';
import { printAllEnvironmentsInfo } from '../lib/dev-environment/dev-environment-core';
import { bootstrapLando } from '../lib/dev-environment/dev-environment-lando';
import { trackEvent } from '../lib/tracker';

const exampleUsage = 'vip dev-env list';
const usage = 'vip dev-env list';

const examples = [
	{
		usage: `${ exampleUsage }`,
		description: 'Retrieve basic information about all local environments.',
	},
];

export default command( {
	usage,
} )
	.examples( examples )
	.argv( process.argv, async () => {
		const lando = await bootstrapLando( { logFile: getDevEnvLogFile() } );
		( lando.events.constructor as typeof EventEmitter ).prototype.setMaxListeners( 1024 );
		validateDependencies( lando );

		const trackingInfo = { all: true };
		await trackEvent( 'dev_env_list_command_execute', trackingInfo );

		try {
			await printAllEnvironmentsInfo( lando, {} );
			await trackEvent( 'dev_env_list_command_success', trackingInfo );
		} catch ( error ) {
			await handleCLIException( error as Error, 'dev_env_list_command_error', trackingInfo );
			process.exitCode = 1;
		}
	} );
