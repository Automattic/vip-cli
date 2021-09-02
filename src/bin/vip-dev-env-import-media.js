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
import { getEnvironmentName, handleCLIException } from '../lib/dev-environment/dev-environment-cli';
import { importMediaPath } from '../lib/dev-environment/dev-environment-core';

command( {
	requiredArgs: 1,
} )
	.option( 'slug', 'Custom name of the dev environment' )
	.argv( process.argv, async ( unmatchedArgs: string[], opt ) => {
		const [ filePath ] = unmatchedArgs;
		const slug = getEnvironmentName( opt );

		try {
			await importMediaPath( slug, filePath );
		} catch ( error ) {
			handleCLIException( error );
		}
	} );
