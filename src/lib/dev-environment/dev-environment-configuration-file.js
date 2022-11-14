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
import * as exit from 'lib/cli/exit';
import type {
	ConfigurationFileOptions,
	InstanceOptions,
} from './types';
import { DEV_ENVIRONMENT_PHP_VERSIONS } from '../constants/dev-environment';

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
	const toBooleanIfDefined = value => {
		if ( value === undefined ) {
			return undefined;
		}
		return !! value;
	};

	if ( configurationFromFile?.php && ! DEV_ENVIRONMENT_PHP_VERSIONS[ configurationFromFile.php ] ) {
		const supportedPhpVersions = Object.keys( DEV_ENVIRONMENT_PHP_VERSIONS ).join( ', ' );
		const messageToShow = `PHP version ${ chalk.grey( configurationFromFile.php ) } specified in` +
			`${ chalk.grey( CONFIGURATION_FILE_NAME ) } is not supported.\nChoose one of: ${ supportedPhpVersions }\n`;

		exit.withError( messageToShow );
	}

	const configuration = {
		slug: configurationFromFile?.slug,
		title: configurationFromFile?.title,
		multisite: toBooleanIfDefined( configurationFromFile?.multisite ),
		php: configurationFromFile?.php,
	};

	// Remove undefined values
	Object.keys( configuration ).forEach( key => configuration[ key ] === undefined && delete configuration[ key ] );

	return configuration;
}

export function mergeConfigurationFileOptions( preselectedOptions: InstanceOptions, configurationFileOptions: ConfigurationFileOptions ): InstanceOptions {
	// TODO: Add instance options to override:
	//    export interface InstanceOptions {
	//    x   title: string;
	//    x   multisite: boolean;
	//        wordpress?: string;
	//        muPlugins?: string;
	//        appCode?: string;
	//        elasticsearch?: boolean;
	//        mariadb?: string;
	//    x   php?: string;
	//        mediaRedirectDomain?: string;
	//        statsd?: boolean;
	//        phpmyadmin?: boolean;
	//        xdebug?: boolean;
	//        xdebugConfig?: string;
	//        [index: string]: string | boolean;
	//    }

	// configurationFileOptions can hold different parameters than present in
	// preselectedOptions like "slug", or differently named parameters.
	// Merge only relevant configurationFileOptions into preselectedOptions.
	const mergeOptions = {
		title: configurationFileOptions?.title,
		multisite: configurationFileOptions?.multisite,
		php: configurationFileOptions?.php,
	};

	// Remove undefined values
	Object.keys( mergeOptions ).forEach( key => mergeOptions[ key ] === undefined && delete mergeOptions[ key ] );

	// preselectedOptions (supplied from command-line) override configurationFileOptions
	return {
		...mergeOptions,
		...preselectedOptions,
	};
}

export function printConfigurationFileInfo( configurationFile: ConfigurationFileOptions ) {
	const isConfigurationFileEmpty = Object.keys( configurationFile ).length === 0;

	if ( isConfigurationFileEmpty ) {
		return;
	}

	console.log( `Found ${ chalk.gray( CONFIGURATION_FILE_NAME ) }. Using the following configuration defaults:` );

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
