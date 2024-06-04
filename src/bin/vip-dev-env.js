#!/usr/bin/env node

import command from '../lib/cli/command';

command( {
	requiredArgs: 0,
} )
	.command( 'create', 'Create a new local environment.' )
	.command( 'update', 'Update the settings of a local environment.' )
	.command( 'start', 'Start a local environment.' )
	.command( 'stop', 'Stop a local environment.' )
	.command( 'destroy', 'Remove a local environment.' )
	.command( 'info', 'Retrieve information about a local environment.' )
	.command( 'list', 'Retrieve information about all local environments.' )
	.command( 'exec', 'Run a WP-CLI command against a local environment.' )
	.command( 'import', 'Import media or database files to a local environment.' )
	.command( 'shell', 'Create a shell and run commands against a local environment.' )
	.command( 'logs', 'Retrieve logs for a local environment.' )
	.command( 'sync', 'Sync the database of a VIP Platform environment to a local environment.' )
	.command( 'purge', 'Remove all local environments.' )
	.argv( process.argv );
