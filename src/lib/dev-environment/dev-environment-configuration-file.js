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
import * as exit from '../cli/exit';
import type { ConfigurationFileOptions, InstanceOptions } from './types';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

export const CONFIGURATION_FILE_NAME = '.vip-dev-env.yml';

export async function getConfigurationFileOptions(): Promise< ConfigurationFileOptions > {
	const configurationFilePath = path.join( process.cwd(), CONFIGURATION_FILE_NAME );
	let configurationFileContents = '';

	const fileExists = await fs.promises
		.access( configurationFilePath, fs.R_OK )
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
		const messageToShow =
			`Configuration file ${ chalk.grey( CONFIGURATION_FILE_NAME ) } could not be loaded:\n` +
			err.toString();
		exit.withError( messageToShow );
	}

	const configuration = await sanitizeConfiguration( configurationFromFile ).catch(
		async ( { message } ) => {
			exit.withError( message );
			return {};
		}
	);

	debug( 'Sanitized configuration from file:', configuration );
	return configuration;
}

async function sanitizeConfiguration( configuration: Object ): Promise< ConfigurationFileOptions > {
	const genericConfigurationError =
		`Configuration file ${ chalk.grey( CONFIGURATION_FILE_NAME ) } is available but ` +
		`couldn't be loaded. Ensure there is a ${ chalk.cyan(
			'configuration-version'
		) } and ${ chalk.cyan( 'slug' ) } ` +
		`configured. For example:\n\n${ chalk.grey( getConfigurationFileExample() ) }`;

	if ( Array.isArray( configuration ) || typeof configuration !== 'object' ) {
		throw new Error( genericConfigurationError );
	}

	if (
		configuration[ 'configuration-version' ] === undefined ||
		configuration.slug === undefined
	) {
		throw new Error( genericConfigurationError );
	}

	const validVersions = getAllConfigurationFileVersions()
		.map( version => chalk.cyan( version ) )
		.join( ', ' );

	if ( ! isValidConfigurationFileVersion( configuration[ 'configuration-version' ] ) ) {
		throw new Error(
			`Configuration file ${ chalk.grey( CONFIGURATION_FILE_NAME ) } has an invalid ` +
				`${ chalk.cyan(
					'configuration-version'
				) } key. Update to a supported version. For example:\n\n` +
				chalk.grey( getConfigurationFileExample() ) +
				`\nSupported configuration versions: ${ validVersions }.\n`
		);
	}

	const stringToBooleanIfDefined = ( value: any ) => {
		if ( value === undefined || ! [ 'true', 'false' ].includes( value ) ) {
			return undefined;
		}
		return value === 'true';
	};

	const sanitizedConfiguration = {
		'configuration-version': configuration[ 'configuration-version' ],
		slug: configuration.slug,
		title: configuration.title,
		multisite: stringToBooleanIfDefined( configuration.multisite ),
		php: configuration.php,
		wordpress: configuration.wordpress,
		'mu-plugins': configuration[ 'mu-plugins' ],
		'app-code': configuration[ 'app-code' ],
		elasticsearch: stringToBooleanIfDefined( configuration.elasticsearch ),
		phpmyadmin: stringToBooleanIfDefined( configuration.phpmyadmin ),
		xdebug: stringToBooleanIfDefined( configuration.xdebug ),
		mailpit: stringToBooleanIfDefined( configuration.mailpit ?? configuration.mailhog ),
		'media-redirect-domain': configuration[ 'media-redirect-domain' ],
		photon: stringToBooleanIfDefined( configuration.photon ),
	};

	// Remove undefined values
	Object.keys( sanitizedConfiguration ).forEach(
		key => sanitizedConfiguration[ key ] === undefined && delete sanitizedConfiguration[ key ]
	);

	return sanitizedConfiguration;
}

export function mergeConfigurationFileOptions(
	preselectedOptions: InstanceOptions,
	configurationFileOptions: ConfigurationFileOptions
): InstanceOptions {
	// configurationFileOptions holds different parameters than present in
	// preselectedOptions like "slug", and friendly-named parameters (e.g.
	// 'app-code' vs 'appCode'). Selectively merge configurationFileOptions
	// parameters into preselectedOptions.
	const configurationFileInstanceOptions: InstanceOptions = {
		title: configurationFileOptions.title,
		multisite: configurationFileOptions.multisite,
		php: configurationFileOptions.php,
		wordpress: configurationFileOptions.wordpress,
		muPlugins: configurationFileOptions[ 'mu-plugins' ],
		appCode: configurationFileOptions[ 'app-code' ],
		elasticsearch: configurationFileOptions.elasticsearch,
		phpmyadmin: configurationFileOptions.phpmyadmin,
		xdebug: configurationFileOptions.xdebug,
		xdebugConfig: configurationFileOptions[ 'xdebug-config' ],
		mailpit: configurationFileOptions.mailpit ?? configurationFileOptions.mailhog,
		mediaRedirectDomain: configurationFileOptions[ 'media-redirect-domain' ],
		photon: configurationFileOptions.photon,
	};

	const mergedOptions: InstanceOptions = {};

	Object.keys( configurationFileInstanceOptions ).forEach( key => {
		// preselectedOptions (supplied from command-line) override configurationFileOptions
		if ( preselectedOptions[ key ] !== undefined ) {
			mergedOptions[ key ] = preselectedOptions[ key ];
		} else if ( configurationFileInstanceOptions[ key ] !== undefined ) {
			mergedOptions[ key ] = configurationFileInstanceOptions[ key ];
		}
	} );

	return mergedOptions;
}

export function printConfigurationFile( configurationOptions: ConfigurationFileOptions ) {
	const isConfigurationFileEmpty = Object.keys( configurationOptions ).length === 0;

	if ( isConfigurationFileEmpty ) {
		return;
	}

	// Customized formatter because Lando's printTable() automatically uppercases keys
	// which may be confusing for YAML configuration
	const settingLines = [];
	for ( const [ key, value ] of Object.entries( configurationOptions ) ) {
		settingLines.push( `${ chalk.cyan( key ) }: ${ String( value ) }` );
	}

	console.log( settingLines.join( '\n' ) + '\n' );
}

const CONFIGURATION_FILE_VERSIONS = [ '0.preview-unstable' ];

function getAllConfigurationFileVersions(): string[] {
	return CONFIGURATION_FILE_VERSIONS;
}

function getLatestConfigurationFileVersion(): string {
	return CONFIGURATION_FILE_VERSIONS[ CONFIGURATION_FILE_VERSIONS.length - 1 ];
}

function isValidConfigurationFileVersion( version: string ): boolean {
	return CONFIGURATION_FILE_VERSIONS.includes( version );
}

function getConfigurationFileExample(): string {
	return `configuration-version: ${ getLatestConfigurationFileVersion() }
slug: dev-site
php: 8.0
wordpress: 6.0
app-code: ./site-code
mu-plugins: image
multisite: false
phpmyadmin: true
elasticsearch: true
xdebug: true
`;
}
