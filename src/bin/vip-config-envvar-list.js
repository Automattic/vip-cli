#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { formatData } from 'lib/cli/format';
import { appQuery, listEnvVars } from 'lib/envvar/api';
import { debug } from 'lib/envvar/logging';

const usage = 'vip config envvar list';

// Command examples
const examples = [
	{
		usage,
		description: 'Lists all environment variables (names only)',
	},
];

command( {
	appContext: true,
	appQuery,
	envContext: true,
	format: true,
	usage,
} )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const envContext = `@${ opt.app.id }.${ opt.env.type }`;

		debug( `Request: list environment variables for @${ envContext }` );

		const envvars = await listEnvVars( opt.app.id, opt.env.id, opt.format );

		if ( 0 === envvars.length ) {
			console.log( chalk.yellow( `There are no environment variables for ${ envContext }.` ) );
			process.exit();
		}

		// Display context for non-machine-readble formats.
		if ( [ 'keyValue', 'table' ].includes( opt.format ) ) {
			console.log( 'For security, the values of environment variables cannot be retrieved.' );
			console.log();
		}

		console.log( formatData( envvars, opt.format ) );
	} );
