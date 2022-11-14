/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import debugLib from 'debug';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

/**
  * Internal dependencies
  */
import type {
	ConfigurationFileOptions,
} from './types';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

const CONFIGURATION_FILE_NAME = '.vip-dev-env.json';

export function getConfigurationFileOptions(): ConfigurationFileOptions {
	const configurationFilePath = path.join( process.cwd(), CONFIGURATION_FILE_NAME );
	let configurationFileContents = '';

	if ( fs.existsSync( configurationFilePath ) ) {
		debug( 'Reading configuration file from:', configurationFilePath );
		configurationFileContents = fs.readFileSync( configurationFilePath );
	} else {
		return {};
	}

	let configurationFromFile = {};

	try {
		configurationFromFile = JSON.parse( configurationFileContents );
	} catch ( err ) {
		debug( 'Error parsing configuration file:', err.toString() );
		return {};
	}

	const configuration = sanitizeConfiguration( configurationFromFile );
	debug( 'Sanitized configuration from file:', configuration );

	return configuration;
}

function sanitizeConfiguration( configuration: Object ): ConfigurationFileOptions {
	return {
		slug: configuration.slug || undefined,
	};
}

export function printConfigurationFileInfo( configurationFile: ConfigurationFileOptions ) {
	const isConfigurationFileEmpty = Object.keys( configurationFile ).length === 0;

	if ( isConfigurationFileEmpty ) {
		return;
	}

	console.log( `Found ${ chalk.gray( CONFIGURATION_FILE_NAME ) }. Using environment with the following configuration:` );

	let configurationFileOutput = '';

	for ( const [ key, value ] of Object.entries( configurationFile ) ) {
		configurationFileOutput += `    ${ chalk.cyan( key ) }: ${ value }\n`;
	}

	console.log( configurationFileOutput );
}
