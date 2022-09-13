#!/usr/bin/env node

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
	.command( 'purge-url', 'Purge page cache' )
	.argv( process.argv );
