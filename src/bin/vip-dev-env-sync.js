#!/usr/bin/env node

import command from '../lib/cli/command';
const usage = 'vip dev-env sync';

const examples = [
	{
		usage: `vip @example-app.develop dev-env sync sql --slug=example-site`,
		description:
			'Sync the database of the develop environment in the "example-app" application to a local environment named "example-site".',
	},
];

command( {
	requiredArgs: 1,
	usage,
} )
	.examples( examples )
	.command( 'sql', 'Sync the database of a VIP Platform environment to a local environment.' )
	.argv( process.argv );
