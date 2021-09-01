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
	.command( 'create', 'Create a new local dev environment' )
	.command( 'start', 'Start a local dev environment' )
	.command( 'stop', 'Stop a local dev environment' )
	.command( 'destroy', 'Remove containers, networks, volumes and configuration files of a local dev environment' )
	.command( 'info', 'Provides basic info about one or multiple local dev environments' )
	.command( 'exec', 'Execute an operation on a dev environment' )
	.argv( process.argv );
