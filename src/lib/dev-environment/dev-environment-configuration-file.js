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
import yaml, { FAILSAFE_SCHEMA } from 'js-yaml';

/**
  * Internal dependencies
  */
import * as exit from 'lib/cli/exit';
import type {
	ConfigurationFileOptions,
	InstanceOptions,
} from './types';
import { DEV_ENVIRONMENT_PHP_VERSIONS } from '../constants/dev-environment';
import { getVersionList } from './dev-environment-core';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

const CONFIGURATION_FILE_NAME = '.vip-dev-env.yml';
const CONFIGURATION_FILE_EXAMPLE = `dev-domain.local:
  php: 8.0
  wordpress: 6.0
  multisite: false
  phpmyadmin: true
  elasticsearch: true
  xdebug: true
  env:
    SOME_VAR: "some var value"
`;

export async function getConfigurationFileOptions(): ConfigurationFileOptions {
	const configurationFilePath = path.join( process.cwd(), CONFIGURATION_FILE_NAME );
	let configurationFileContents = '';

	const fileExists = await fs.promises.access( configurationFilePath, fs.R_OK )
		.then( () => true )
		.catch( () => false );

	if ( fileExists ) {
		debug( 'Reading configuration file from:', configurationFilePath );
		configurationFileContents = await fs.promises.readFile( configurationFilePath, 'utf8' );
	} else {
		return {};
	}

	let configurationFromFile = {};

	try {
		configurationFromFile = yaml.load( configurationFileContents, {
			// Only allow strings, arrays, and objects to be parsed from configuration file
			// This causes number-looking values like `php: 8.1` to be parsed directly into strings
			schema: FAILSAFE_SCHEMA,
		} );
	} catch ( err ) {
		// If the configuration file is present but has YAML parsing errors,
		const messageToShow = `Configuration file ${ chalk.grey( CONFIGURATION_FILE_NAME ) } had could not be loaded:\n` +
			err.toString();
		exit.withError( messageToShow );
	}

	const configuration = await sanitizeConfiguration( configurationFromFile )
		.catch( async ( { message } ) => {
			exit.withError( message );
		} );

	debug( 'Sanitized configuration from file:', configuration );
	return configuration;
}

async function sanitizeConfiguration( configurationFromFile: Object ): Promise<ConfigurationFileOptions> {
	const genericConfigurationError = `Configuration file ${ chalk.grey( CONFIGURATION_FILE_NAME ) } couldn't ` +
		'be loaded. Ensure there is one top-level site slug with options configured as children.\nFor example:\n\n' +
		chalk.grey( CONFIGURATION_FILE_EXAMPLE );

	if ( Array.isArray( configurationFromFile ) || typeof configurationFromFile !== 'object' ) {
		throw new Error( genericConfigurationError );
	} else if ( Object.keys( configurationFromFile ).length !== 1 ) {
		throw new Error( genericConfigurationError );
	}

	const slug = Object.keys( configurationFromFile )[ 0 ];
	const siteProperties = configurationFromFile[ slug ];

	const toBooleanIfDefined = value => {
		if ( value === undefined ) {
			return undefined;
		}
		return !! value;
	};

	if ( siteProperties?.php ) {
		validatePhpVersion( siteProperties.php );
	}

	if ( siteProperties?.wordpress ) {
		await validateWordpressVersion( siteProperties.wordpress );
	}

	const configuration = {
		slug: siteProperties?.slug,
		title: siteProperties?.title,
		multisite: toBooleanIfDefined( siteProperties?.multisite ),
		php: siteProperties?.php,
		wordpress: siteProperties?.wordpress,
	};

	// Remove undefined values
	Object.keys( configuration ).forEach( key => configuration[ key ] === undefined && delete configuration[ key ] );

	return configuration;
}

function validatePhpVersion( phpVersion ) {
	if ( ! DEV_ENVIRONMENT_PHP_VERSIONS[ phpVersion ] ) {
		const supportedPhpVersions = Object.keys( DEV_ENVIRONMENT_PHP_VERSIONS ).join( ', ' );
		const messageToShow = `PHP version ${ chalk.grey( phpVersion ) } specified in ` +
			`${ chalk.grey( CONFIGURATION_FILE_NAME ) } is not supported.\nSupported versions: ${ supportedPhpVersions }\n`;

		throw new Error( messageToShow );
	}
}

async function validateWordpressVersion( wordpressVersion ): Promise<void> {
	const wordpressVersionList = await getVersionList();
	const matchingWordpressVersion = wordpressVersionList.find( version => version.tag === wordpressVersion );

	if ( ! matchingWordpressVersion ) {
		const supportedWordpressVersions = wordpressVersionList.map( version => version.tag ).join( ', ' );
		const messageToShow = `WordPress version ${ chalk.grey( wordpressVersion ) } specified in ` +
			`${ chalk.grey( CONFIGURATION_FILE_NAME ) } is not supported.\nSupported versions: ${ supportedWordpressVersions }\n`;

		throw new Error( messageToShow );
	}
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

	// configurationFileOptions may hold different parameters than present in
	// preselectedOptions like "slug", or differently named parameters.
	// Merge only relevant configurationFileOptions into preselectedOptions.
	const mergeOptions = {
		title: configurationFileOptions?.title,
		multisite: configurationFileOptions?.multisite,
		php: configurationFileOptions?.php,
		wordpress: configurationFileOptions?.wordpress,
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
