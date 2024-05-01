#!/usr/bin/env node

import command from '../lib/cli/command';

const usage = 'vip config';
const exampleUsage = 'vip @example-app.develop config';

// Command examples
const examples = [
	{
		usage: `${ exampleUsage } envvar list`,
		description: 'List the names of all environment variables on the environment.',
	},
	{
		usage: `${ exampleUsage } software get`,
		description: 'Retrieve the current versions of all environment software.',
	},
];

command( {
	requiredArgs: 2,
	usage,
} )
	.command( 'envvar', 'Manage environment variables for an environment.' )
	.command( 'software', 'Manage versions of software for an environment.' )
	.examples( examples )
	.argv( process.argv, async () => {
		process.exit( 0 );
	} );
