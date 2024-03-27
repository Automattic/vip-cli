#!/usr/bin/env node

import command from '../lib/cli/command';

const usage = 'vip config';
const exampleUsage = 'vip @example-app.develop config';

// Command examples
const examples = [
	{
		usage: `${ exampleUsage } software get`,
		description: 'Retrieve the current software configuration for all supported components.',
	},
	{
		usage: `${ exampleUsage } envvar list`,
		description: 'List the name of all environment variables in an application environment.',
	},
];

command( {
	requiredArgs: 2,
	usage,
} )
	.command( 'envvar', 'Manage environment variables for an application environment.' )
	.command( 'software', 'Manage software configuration for an application environment.' )
	.examples( examples )
	.argv( process.argv, async () => {
		process.exit( 0 );
	} );
