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
import command from 'lib/cli/command';

command( {
	requiredArgs: 2,
} )
	.command( 'purge', 'Purge cache' )
	.argv( process.argv );
