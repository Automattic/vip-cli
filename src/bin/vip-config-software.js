#!/usr/bin/env node

import command from '../lib/cli/command';

const usage = 'vip config software';
const exampleUsage = 'vip @example-app.develop config software';
const exampleUsageNode = 'vip @example-node-app.develop config software';

// Command examples
const examples = [
	{
		usage: `${ exampleUsage } get`,
		description: 'Retrieve the current software configuration for all supported components.',
	},
	{
		usage: `${ exampleUsage } get wordpress --include available_versions`,
		description:
			'Retrieve the current software configuration for WordPress including available versions.',
	},
	{
		usage: `${ exampleUsage } update wordpress 6.4`,
		description: 'Update WordPress application environment to 6.4.x.',
	},
	{
		usage: `${ exampleUsageNode } update nodejs 18`,
		description: 'Update Node.js application environment to 18.x.',
	},
];

command( {
	requiredArgs: 1,
	usage,
} )
	.command( 'get', 'Retrieve the current software configuration for an application environment.' )
	.command( 'update', 'Update the software configuration for an application environment.' )
	.examples( examples )
	.argv( process.argv );
