#!/usr/bin/env node

import command from '../lib/cli/command';

const exampleUsage = 'vip dev-env import';
const usage = 'vip dev-env import';

const examples = [
	{
		usage: `${ exampleUsage } sql /Users/example/Downloads/file.sql`,
		description: 'Import the SQL file named "file.sql" from a path on the user\'s local machine to a running local environment.',
	},
	{
		usage: `${ exampleUsage } media /Users/example/Desktop/uploads`,
		description:
			'Import the contents of the "uploads" directory from a path on the user\'s local machine to the "/wp-content/uploads" directory of a running local environment.',
	},
];

command( {
	requiredArgs: 1,
	usage,
} )
	.examples( examples )
	.command( 'sql', 'Import a SQL file to a running local environment.' )
	.command(
		'media',
		'Import media files to a running local environment.'
	)
	.argv( process.argv );
