#!/usr/bin/env node

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
	.command( 'sql', 'Sync local database with a production environment' )
	.argv( process.argv );
