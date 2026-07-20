#!/usr/bin/env node

import command from '../lib/cli/command';

const usage = 'vip app deploy-token';
const exampleUsage = 'vip @example-app.develop app deploy-token';

const examples = [
	{
		usage: `${ exampleUsage } generate`,
		description:
			'Generate a custom deploy access token for an environment that already has Custom Deployment enabled.',
	},
	{
		usage: `${ exampleUsage } generate --format=json | jq -r '.[0].token'`,
		description: 'Generate a token and extract the token value for scripting workflows.',
	},
];

void command( {
	requiredArgs: 0,
	usage,
} )
	.command( 'generate', 'Generate a custom deploy access token for an environment.' )
	.examples( examples )
	.argv( process.argv, () => {
		process.exit( 0 );
	} );
