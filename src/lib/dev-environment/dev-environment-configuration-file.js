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
		const messageToShow = `Configuration file ${ chalk.grey( CONFIGURATION_FILE_NAME ) } could not be loaded:\n` +
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

	const stringToBooleanIfDefined = value => {
		if ( value === undefined || ! [ 'true', 'false' ].includes( value ) ) {
			return undefined;
		}
		return value === 'true';
	};

	const configuration = {
		slug,
		title: siteProperties.title,
		multisite: stringToBooleanIfDefined( siteProperties.multisite ),
		php: siteProperties.php,
		wordpress: siteProperties.wordpress,
		'mu-plugins': siteProperties[ 'mu-plugins' ],
		'app-code': siteProperties[ 'app-code' ],
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
	//    x   wordpress?: string;
	//    x   muPlugins?: string;
	//    x   appCode?: string;
	//        elasticsearch?: boolean;
	//        mariadb?: string;
	//    x   php?: string;
	//        phpmyadmin?: boolean;
	//        xdebug?: boolean;
	//
	//        Maybe support:
	//        mediaRedirectDomain?: string;
	//        statsd?: boolean;
	//        xdebugConfig?: string;
	//    }

	// configurationFileOptions holds different parameters than present in
	// preselectedOptions like "slug" and differently named parameters (e.g.
	// 'app-code' vs 'appCode'). Selectively merge configurationFileOptions
	// parameters into preselectedOptions.
	const mergeOptions = {
		title: configurationFileOptions.title,
		multisite: configurationFileOptions.multisite,
		php: configurationFileOptions.php,
		wordpress: configurationFileOptions.wordpress,
		muPlugins: configurationFileOptions[ 'mu-plugins' ],
		appCode: configurationFileOptions[ 'app-code' ],
	};

	// Remove undefined values
	Object.keys( mergeOptions ).forEach( key => mergeOptions[ key ] === undefined && delete mergeOptions[ key ] );

	// preselectedOptions (supplied from command-line) override configurationFileOptions
	return {
		...mergeOptions,
		...preselectedOptions,
	};
}

export function printConfigurationFileInfo( configurationOptions: ConfigurationFileOptions ) {
	const isConfigurationFileEmpty = Object.keys( configurationOptions ).length === 0;

	if ( isConfigurationFileEmpty ) {
		return;
	}

	console.log( `\nFound ${ chalk.gray( CONFIGURATION_FILE_NAME ) }. Using configuration defaults:` );

	// Customized formatter because Lando's printTable() automatically uppercases keys
	// which may be confusing for YAML configuration
	const settingLines = [];
	for ( const [ key, value ] of Object.entries( configurationOptions ) ) {
		if ( key === 'slug' ) {
			continue;
		}

		settingLines.push( `  ${ chalk.cyan( key ) }: ${ value }` );
	}

	console.log( `${ chalk.cyan( configurationOptions.slug ) }:` );
	console.log( settingLines.join( '\n' ) + '\n' );
}
