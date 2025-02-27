import chalk from 'chalk';
import debugLib from 'debug';
import ejs from 'ejs';
import yaml, { FAILSAFE_SCHEMA } from 'js-yaml';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { CONFIGURATION_FOLDER } from './dev-environment-cli';
import * as exit from '../cli/exit';

import type { ConfigurationFileMeta, ConfigurationFileOptions, InstanceOptions } from './types';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

export const CONFIGURATION_FILE_NAME = 'vip-dev-env.yml';
export const CONFIGURATION_TEMPLATE_FILE_NAME = 'vip-dev-env.yml.ejs';

export async function getConfigurationFileOptions(): Promise< ConfigurationFileOptions > {
	const configurationFile = await findConfigurationFile();

	if ( configurationFile === false ) {
		return {};
	}

	const { configurationPath, configurationContents } = configurationFile;

	let configurationFromFile: Record< string, unknown > = {};

	try {
		configurationFromFile = yaml.load( configurationContents, {
			// Only allow strings, arrays, and objects to be parsed from configuration file
			// This causes number-looking values like `php: 8.1` to be parsed directly into strings
			schema: FAILSAFE_SCHEMA,
		} ) as Record< string, unknown >;
	} catch ( err ) {
		const messageToShow =
			`Configuration file ${ chalk.grey( configurationPath ) } could not be loaded:\n` +
			( err as Error ).toString();
		exit.withError( messageToShow );
	}

	try {
		let configuration = sanitizeConfiguration( configurationFromFile, configurationPath );
		configuration = adjustRelativePaths( configuration, configurationPath );

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
		mailpit: stringToBooleanIfDefined( configuration.mailpit ),
		'media-redirect-domain': configuration[ 'media-redirect-domain' ]?.toString(),
		photon: stringToBooleanIfDefined( configuration.photon ),
		cron: stringToBooleanIfDefined( configuration.cron ),
		overrides: configuration.overrides?.toString(),
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

	if ( configuration[ 'app-code' ] && configuration[ 'app-code' ] !== 'image' ) {
		const dir = configuration[ 'app-code' ];
		configuration[ 'app-code' ] = path.isAbsolute( dir )
			? dir
			: path.join( configurationDirectory, dir );
	}

	if ( configuration[ 'mu-plugins' ] && configuration[ 'mu-plugins' ] !== 'image' ) {
		const dir = configuration[ 'mu-plugins' ];
		configuration[ 'mu-plugins' ] = path.isAbsolute( dir )
			? dir
			: path.join( configurationDirectory, dir );
	}

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
		mailpit: configurationFileOptions.mailpit,
		mediaRedirectDomain: configurationFileOptions[ 'media-redirect-domain' ],
		photon: configurationFileOptions.photon,
		cron: configurationFileOptions.cron,
		overrides: configurationFileOptions.overrides,
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

async function findConfigurationFile(): Promise<
	{ configurationPath: string; configurationContents: string } | false
> {
	let currentPath = process.cwd();
	const rootPath = path.parse( currentPath ).root;

	let depth = 0;
	const maxDepth = 64;

	type Location = {
		dir: string;
		file: string;
		template: boolean;
	};

	const locations: Location[] = [];
	while ( currentPath !== rootPath && depth < maxDepth ) {
		locations.push(
			{
				dir: path.join( currentPath, CONFIGURATION_FOLDER ),
				file: path.join( currentPath, CONFIGURATION_FOLDER, CONFIGURATION_TEMPLATE_FILE_NAME ),
				template: true,
			},
			{
				dir: path.join( currentPath, CONFIGURATION_FOLDER ),
				file: path.join( currentPath, CONFIGURATION_FOLDER, CONFIGURATION_FILE_NAME ),
				template: false,
			},
			{
				dir: currentPath,
				file: path.join( currentPath, '.' + CONFIGURATION_TEMPLATE_FILE_NAME ),
				template: true,
			},
			{
				dir: currentPath,
				file: path.join( currentPath, '.' + CONFIGURATION_FILE_NAME ),
				template: false,
			}
		);

		// Move up one directory
		currentPath = path.dirname( currentPath );

		// Use depth as a sanity check to avoid an infitite loop
		++depth;
	}

	for ( const { dir, file, template } of locations ) {
		try {
			// eslint-disable-next-line no-await-in-loop
			const contents = await readFile( file, 'utf8' );
			if ( template ) {
				const rendered = ejs.render( contents, { configDir: dir } );
				return { configurationPath: file, configurationContents: rendered };
			}

			return { configurationPath: file, configurationContents: contents };
		} catch (error) {
			debug(`Error reading or rendering file ${file}: ${error.message}`);
		}
	}

	return false;
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
php: 8.2
wordpress: 6.2
app-code: ../
mu-plugins: image
multisite: false
phpmyadmin: false
elasticsearch: false
xdebug: false
mailpit: false
photon: false
cron: false
`;
}
