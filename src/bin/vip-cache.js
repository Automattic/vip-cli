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
	.command( 'purge-url', 'Purge page cache' )
	.argv( process.argv );
