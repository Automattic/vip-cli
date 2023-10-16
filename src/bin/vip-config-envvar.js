#!/usr/bin/env node

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';

command( {
	requiredArgs: 0,
} )
	.command( 'delete', 'Permanently delete an environment variable' )
	.command( 'get', 'Get the value of an environment variable' )
	.command( 'get-all', 'Get the values of all environment variable' )
	.command( 'list', 'List the names of all environment variables' )
	.command( 'set', 'Add or update an environment variable' )
	.argv( process.argv );
