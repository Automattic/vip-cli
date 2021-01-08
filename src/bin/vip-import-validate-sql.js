#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { validate } from 'lib/validations/sql';

command( {
	requiredArgs: 1,
} )
	.example( 'vip import validate-sql <file>', 'Run the import validation against file' )
	.argv( process.argv, async arg => {
		const filename = arg[ 0 ];
		if ( ! arg && ! filename ) {
			console.error( 'You must pass in a filename' );
			process.exit( 1 );
		}

		validate( filename );
	} );
