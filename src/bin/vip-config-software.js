#!/usr/bin/env node

import command from '../lib/cli/command';

const usage = 'vip config software';
const exampleUsage = 'vip @example-app.develop config software';
const exampleUsageNode = 'vip @example-node-app.develop config software';

// Command examples
const examples = [
	{
		usage: `${ exampleUsage } get`,
		description:
			'Retrieve a list of the current versions of all environment software in the default table format.',
	},
	{
		usage: `${ exampleUsage } get wordpress --include=available_versions`,
		description:
			'Retrieve the current version of WordPress for a WordPress environment and a list of available versions in the default table format.',
	},
	{
		usage: `${ exampleUsage } update wordpress 6.4`,
		description: 'Update the version of WordPress on a WordPress environment to 6.4.x.',
	},
	{
		usage: `${ exampleUsageNode } update nodejs 18`,
		description: 'Update the version of Node.js on a Node.js environment to 18.x.',
	},
];

command( {
	requiredArgs: 1,
	usage,
} )
	.command( 'get', 'Retrieve the current versions of environment software.' )
	.command( 'update', 'Update the version of software running on an environment.' )
	.examples( examples )
	.argv( process.argv );
