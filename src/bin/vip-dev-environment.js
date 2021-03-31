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
	.argv( process.argv );
