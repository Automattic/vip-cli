#!/usr/bin/env node

import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { validate } from '../lib/validations/sql';

const usage = 'vip import validate-sql';

command( {
	requiredArgs: 1,
	usage,
} )
	.example(
		'vip import validate-sql file.sql',
		'Scan the local file named "file.sql" for SQL validation errors and potential incompatibilities with platform databases.'
	)
	.argv( process.argv, async arg => {
		const filename = arg[ 0 ];
		if ( ! filename ) {
			exit.withError( 'You must pass in a filename.' );
		}

		await validate( filename );
	} );
