#!/usr/bin/env node

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { validate } from '../lib/validations/sql';

command( {
	requiredArgs: 1,
} )
	.example( 'vip import validate-sql <file>', 'Run the import validation against file' )
	.argv( process.argv, async arg => {
		const filename = arg[ 0 ];
		if ( ! filename ) {
			exit.withError( 'You must pass in a filename' );
		}

		await validate( filename );
	} );
