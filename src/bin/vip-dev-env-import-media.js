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
	.option( 'slug', 'Custom name of the dev environment' )
	.argv( process.argv, async ( unmatchedArgs: string[], opt ) => {
		console.log( 'Importing media to a dev environment is not yet available.' );
	} );
