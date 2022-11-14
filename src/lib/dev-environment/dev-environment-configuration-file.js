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

function sanitizeConfiguration( configuration: any ): ConfigurationFileOptions {
	return configuration;
}
