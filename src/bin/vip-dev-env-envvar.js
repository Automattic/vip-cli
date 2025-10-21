#!/usr/bin/env node

import command from '../lib/cli/command';

const usage = 'vip dev-env envvar';
const exampleUsage = 'vip dev-env envvar';

const examples = [
	{
		usage: `${ exampleUsage } set --slug=example-site MY_VARIABLE`,
		description:
			'Add or update the local environment variable "MY_VARIABLE" and assign its value at the prompt.',
	},
	{
		usage: `${ exampleUsage } get --slug=example-site MY_VARIABLE`,
		description: 'Retrieve the value of the local environment variable "MY_VARIABLE".',
	},
	{
		usage: `${ exampleUsage } get-all --slug=example-site`,
		description: 'Retrieve a list of all local environment variables in the default table format.',
	},
	{
		usage: `${ exampleUsage } list --slug=example-site`,
		description: 'List the names of all local environment variables.',
	},
	{
		usage: `${ exampleUsage } delete --slug=example-site MY_VARIABLE`,
		description: 'Delete the local environment variable "MY_VARIABLE" from the environment.',
	},
];

command( {
	requiredArgs: 0,
	usage,
} )
	.command( 'delete', 'Delete a local environment variable.' )
	.command( 'get', 'Retrieve the value of a local environment variable.' )
	.command( 'get-all', 'Retrieve the names and values of all local environment variables.' )
	.command( 'list', 'List the names of all local environment variables.' )
	.command(
		'set',
		'Add or update a local environment variable that begins with an uppercase letter and only includes the allowed characters A-Z, 0-9, or _.'
	)
	.examples( examples )
	.argv( process.argv );
