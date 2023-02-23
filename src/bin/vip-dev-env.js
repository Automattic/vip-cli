#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';

command( {
	requiredArgs: 1,
} )
	.command( 'create', 'Create a new local dev environment' )
	.command( 'update', 'Update an already created local dev environment' )
	.command( 'start', 'Start a local dev environment' )
	.command( 'stop', 'Stop a local dev environment' )
	.command( 'destroy', 'Remove containers, networks, volumes and configuration files of a local dev environment' )
	.command( 'info', 'Provides basic info about one or multiple local dev environments' )
	.command( 'list', 'Provides basic info about all local dev environments' )
	.command( 'exec', 'Execute a WP-CLI command in local dev environment' )
	.command( 'import', 'Import data into a local WordPress environment' )
	.command( 'shell', 'Spawns a shell in a dev environment' )
	.command( 'logs', 'View logs from a local WordPress environment' )
	.argv( process.argv );
