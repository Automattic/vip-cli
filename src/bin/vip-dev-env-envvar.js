#!/usr/bin/env node

import command from '../lib/cli/command';

const usage = 'vip dev-env envvar';
const exampleUsage = 'vip dev-env envvar';

const examples = [
	{
		usage: `${ exampleUsage } set MY_VARIABLE`,
		description:
			'Add or update the environment variable "MY_VARIABLE" and assign its value at the prompt.',
	},
	{
		usage: `${ exampleUsage } get MY_VARIABLE`,
		description: 'Retrieve the value of the environment variable "MY_VARIABLE".',
	},
	{
		usage: `${ exampleUsage } get-all`,
		description: 'Retrieve a list of all environment variables in the default table format.',
	},
	{
		usage: `${ exampleUsage } list`,
		description: 'List the names of all environment variables.',
	},
	{
		usage: `${ exampleUsage } delete MY_VARIABLE`,
		description: 'Delete the environment variable "MY_VARIABLE" from the environment.',
	},
];

command( {
	requiredArgs: 0,
	usage,
} )
	.command( 'delete', 'Delete an environment variable.' )
	.command( 'get', 'Retrieve the value of an environment variable.' )
	.command( 'get-all', 'Retrieve the names and values of all environment variables.' )
	.command( 'list', 'List the names of all environment variables.' )
	.command( 'set', 'Add or update an environment variable.' )
	.examples( examples )
	.argv( process.argv );
