#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import * as exit from 'lib/cli/exit';
import { validate } from 'lib/validations/sql';

command( {
	requiredArgs: 1,
} )
	.example( 'vip import validate-sql <file>', 'Run the import validation against file' )
	.argv( process.argv, async arg => {
		const filename = arg[ 0 ];
		if ( ! arg && ! filename ) {
			exit.withError( 'You must pass in a filename' );
		}

		validate( filename );
	} );
