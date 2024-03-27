#!/usr/bin/env node

import command from '../lib/cli/command';

const usage = 'vip config envvar';
const exampleUsage = 'vip @example-app.develop config envvar';

// Command examples
const examples = [
	{
		usage: `${ exampleUsage } delete MY_VARIABLE`,
		description: 'Delete the environment variable "MY_VARIABLE" from the application environment.',
	},
	{
		usage: `${ exampleUsage } get-all`,
		description: 'Retrieve a list of all environment variables in the default table format.',
	},
	{
		usage: `${ exampleUsage } get MY_VARIABLE`,
		description: 'Get the value of the environment variable "MY_VARIABLE".',
	},
	{
		usage: `${ exampleUsage } list`,
		description: 'List the name of all environment variables.',
	},
	{
		usage: `${ exampleUsage } set MY_VARIABLE`,
		description: 'Set the environment variable "MY_VARIABLE" with a prompts for a value.',
	},
];

command( {
	requiredArgs: 0,
	usage,
} )
	.command( 'delete', 'Delete an environment variable.' )
	.command( 'get', 'Retrieve the value of an environment variable.' )
	.command( 'get-all', 'Retrieve the values of all environment variables.' )
	.command( 'list', 'List the names of all environment variables.' )
	.command( 'set', 'Add or update an environment variable.' )
	.examples( examples )
	.argv( process.argv );
