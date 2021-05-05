#!/usr/bin/env node

/**
 * @flow
 * @fomat
 */

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';

command( {
	requiredArgs: 1,
} )
	.command( 'create', 'Create a local dev environment' )
	.command( 'start', 'Start a local dev environment' )
	.command( 'stop', 'Stop a local dev environment' )
	.command( 'destroy', 'Destroy a local dev environment' )
	.command( 'info', 'Provides basic info about a local dev environment' )
	.command( 'wp', 'Run wp cli command' )
	.argv( process.argv );
