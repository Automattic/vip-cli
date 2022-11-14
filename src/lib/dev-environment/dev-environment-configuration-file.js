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
	InstanceOptions,
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

function sanitizeConfiguration( configurationFromFile: Object ): ConfigurationFileOptions {
	const configuration = {};

	if ( configurationFromFile?.slug ) {
		configuration.slug = configurationFromFile.slug;
	}

	if ( configurationFromFile?.title ) {
		configuration.title = configurationFromFile.title;
	}

	return configuration;
}

export function printConfigurationFileInfo( configurationFile: ConfigurationFileOptions ) {
	const isConfigurationFileEmpty = Object.keys( configurationFile ).length === 0;

	if ( isConfigurationFileEmpty ) {
		return;
	}

	console.log( `Found ${ chalk.gray( CONFIGURATION_FILE_NAME ) }. Using environment with the following configuration:` );

	let configurationFileOutput = '';

	// Customized formatter because printTable automatically uppercases keys
	// which may be confusing for JSON keys
	const longestKeyLength = Math.max( ...Object.keys( configurationFile ).map( key => key.length ) );

	for ( const [ key, value ] of Object.entries( configurationFile ) ) {
		const paddedKey = key.padStart( longestKeyLength, ' ' );
		configurationFileOutput += `    ${ chalk.cyan( paddedKey ) }: ${ value }\n`;
	}

	console.log( configurationFileOutput );
}

export function mergeConfigurationFileOptions( preselectedOptions: InstanceOptions, configurationFileOptions: ConfigurationFileOptions ): InstanceOptions {
	const { title } = configurationFileOptions;

	// Preselected options take precedence over configuration file options
	return {
		title,
		...preselectedOptions,
	};
}
