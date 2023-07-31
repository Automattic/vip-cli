/**
 * External dependencies
 */
import { access, constants, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import debugLib from 'debug';
import chalk from 'chalk';
import yaml, { FAILSAFE_SCHEMA } from 'js-yaml';

/**
 * Internal dependencies
 */
import { CONFIGURATION_FOLDER } from './dev-environment-cli';
import * as exit from '../cli/exit';
import type { ConfigurationFileMeta, ConfigurationFileOptions, InstanceOptions } from './types';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

export const CONFIGURATION_FILE_NAME = 'vip-dev-env.yml';

export async function getConfigurationFileOptions(): Promise< ConfigurationFileOptions > {
	const configurationFilePath = await findConfigurationFilePath();

	if ( configurationFilePath === false ) {
		return {};
	}

	debug( 'Reading configuration file from:', configurationFilePath );
	const configurationFileContents = await readFile( configurationFilePath, 'utf8' );

	let configurationFromFile: Record< string, unknown > = {};

	try {
		configurationFromFile = yaml.load( configurationFileContents, {
			// Only allow strings, arrays, and objects to be parsed from configuration file
			// This causes number-looking values like `php: 8.1` to be parsed directly into strings
			schema: FAILSAFE_SCHEMA,
		} ) as Record< string, unknown >;
	} catch ( err ) {
		const messageToShow =
			`Configuration file ${ chalk.grey( configurationFilePath ) } could not be loaded:\n` +
			( err as Error ).toString();
		exit.withError( messageToShow );
	}

	try {
		let configuration = sanitizeConfiguration( configurationFromFile, configurationFilePath );
		configuration = adjustRelativePaths( configuration, configurationFilePath );

		debug( 'Sanitized configuration from file:', configuration );
		return configuration;
	} catch ( err ) {
		exit.withError( err instanceof Error ? err : new Error( 'Unknown error' ) );
	}
}

function sanitizeConfiguration(
	configuration: Record< string, unknown >,
	configurationFilePath: string
): ConfigurationFileOptions {
	const genericConfigurationError =
		`Configuration file ${ chalk.grey( configurationFilePath ) } is available but ` +
		`couldn't be loaded. Ensure there is a ${ chalk.cyan(
			'configuration-version'
		) } and ${ chalk.cyan( 'slug' ) } ` +
		`configured. For example:\n\n${ chalk.grey( getConfigurationFileExample() ) }`;

	if ( Array.isArray( configuration ) || typeof configuration !== 'object' ) {
		throw new Error( genericConfigurationError );
	}

	const version: unknown = configuration[ 'configuration-version' ];

	if (
		( typeof version !== 'string' && typeof version !== 'number' ) ||
		configuration.slug === undefined ||
		configuration.slug === null
	) {
		throw new Error( genericConfigurationError );
	}

	const validVersions = getAllConfigurationFileVersions()
		.map( ver => chalk.cyan( ver ) )
		.join( ', ' );

	if ( ! isValidConfigurationFileVersion( version.toString() ) ) {
		throw new Error(
			`Configuration file ${ chalk.grey( configurationFilePath ) } has an invalid ` +
				`${ chalk.cyan(
					'configuration-version'
				) } key. Update to a supported version. For example:\n\n` +
				chalk.grey( getConfigurationFileExample() ) +
				`\nSupported configuration versions: ${ validVersions }.\n`
		);
	}

	const stringToBooleanIfDefined = ( value: unknown ) => {
		if ( typeof value !== 'string' || ! [ 'true', 'false' ].includes( value ) ) {
			return undefined;
		}
		return value === 'true';
	};

	const configurationMeta: ConfigurationFileMeta = {
		'configuration-path': configurationFilePath,
	};

	const sanitizedConfiguration: ConfigurationFileOptions = {
		version: version.toString(),
		// eslint-disable-next-line @typescript-eslint/no-base-to-string
		slug: configuration.slug.toString(), // NOSONAR
		title: configuration.title?.toString(),
		multisite: stringToBooleanIfDefined( configuration.multisite ),
		php: configuration.php?.toString(),
		wordpress: configuration.wordpress?.toString(),
		'mu-plugins': configuration[ 'mu-plugins' ]?.toString(),
		'app-code': configuration[ 'app-code' ]?.toString(),
		elasticsearch: stringToBooleanIfDefined( configuration.elasticsearch ),
		phpmyadmin: stringToBooleanIfDefined( configuration.phpmyadmin ),
		xdebug: stringToBooleanIfDefined( configuration.xdebug ),
		mailpit: stringToBooleanIfDefined( configuration.mailpit ?? configuration.mailhog ),
		'media-redirect-domain': configuration[ 'media-redirect-domain' ]?.toString(),
		photon: stringToBooleanIfDefined( configuration.photon ),
		meta: configurationMeta,
	};

	// Remove undefined values
	Object.keys( sanitizedConfiguration ).forEach(
		// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
		key => sanitizedConfiguration[ key ] === undefined && delete sanitizedConfiguration[ key ]
	);

	return sanitizedConfiguration;
}

function adjustRelativePaths(
	configuration: ConfigurationFileOptions,
	configurationFilePath: string
): ConfigurationFileOptions {
	const configurationDirectory = path.resolve( path.dirname( configurationFilePath ) );
	const configurationKeysWithRelativePaths = [ 'app-code', 'mu-plugins' ];

	configurationKeysWithRelativePaths.forEach( key => {
		if ( configuration[ key ] && configuration[ key ] !== 'image' ) {
			configuration[ key ] = path.join( configurationDirectory, configuration[ key ] );
		}
	} );

	return configuration;
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

async function findConfigurationFilePath(): Promise< string | false > {
	let currentPath = process.cwd();
	const rootPath = path.parse( currentPath ).root;

	let depth = 0;
	const maxDepth = 64;
	const pathPromises = [];

	while ( currentPath !== rootPath && depth < maxDepth ) {
		const configurationFilePath = path.join(
			currentPath,
			CONFIGURATION_FOLDER,
			CONFIGURATION_FILE_NAME
		);

		pathPromises.push(
			access( configurationFilePath, constants.R_OK ).then( () => configurationFilePath )
		);

		// Move up one directory
		currentPath = path.dirname( currentPath );

		// Use depth as a sanity check to avoid an infitite loop
		depth++;
	}

	return Promise.any( pathPromises )
		.then( configurationFilePath => {
			return configurationFilePath;
		} )
		.catch( () => false );
}

const CONFIGURATION_FILE_VERSIONS = [ '1' ];

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
title: Dev Site
php: 8.0
wordpress: 6.2
app-code: ../
mu-plugins: image
multisite: false
phpmyadmin: false
elasticsearch: false
xdebug: false
mailpit: false
photon: false
`;
}
