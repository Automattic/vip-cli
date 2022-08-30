/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import chalk from 'chalk';
import formatters from 'lando/lib/formatters';
import { prompt, Confirm, Select } from 'enquirer';
import debugLib from 'debug';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Internal dependencies
 */
import * as exit from 'lib/cli/exit';
import { trackEvent } from '../tracker';
import {
	DEV_ENVIRONMENT_FULL_COMMAND,
	DEV_ENVIRONMENT_DEFAULTS,
	DEV_ENVIRONMENT_PROMPT_INTRO,
	DEV_ENVIRONMENT_COMPONENTS,
	DEV_ENVIRONMENT_NOT_FOUND,
	DEV_ENVIRONMENT_PHP_VERSIONS,
} from '../constants/dev-environment';
import { getVersionList, readEnvironmentData } from './dev-environment-core';
import type { AppInfo, ComponentConfig, InstanceOptions, EnvironmentNameOptions, InstanceData } from './types';
import { validateDockerInstalled } from './dev-environment-lando';
import UserError from '../cli/userError';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

const DEFAULT_SLUG = 'vip-local';

export async function handleCLIException( exception: Error, trackKey?: string, trackBaseInfo?: any = {} ) {
	const errorPrefix = chalk.red( 'Error:' );
	if ( DEV_ENVIRONMENT_NOT_FOUND === exception.message ) {
		const createCommand = chalk.bold( DEV_ENVIRONMENT_FULL_COMMAND + ' create' );

		const message = `Environment doesn't exist.\n\n\nTo create a new environment run:\n\n${ createCommand }\n`;
		console.log( errorPrefix, message );
	} else {
		let message = exception.message;
		// if the message has already ERROR prefix we should drop it as we are adding our own cool red Error-prefix
		message = message.replace( 'ERROR: ', '' );

		console.log( errorPrefix, message );

		if ( trackKey ) {
			try {
				const errorTrackingInfo = { ...trackBaseInfo, failure: message, stack: exception.stack };
				await trackEvent( trackKey, errorTrackingInfo );
			} catch ( trackException ) {
				console.log( errorPrefix, `Failed to record track event ${ trackKey }`, trackException.message );
			}
		}

		if ( ! process.env.DEBUG ) {
			console.log( `\nPlease re-run the command with "--debug ${ chalk.bold( '@automattic/vip:bin:dev-environment' ) }" appended to it and provide the stack trace on the support ticket.` );
			console.log( chalk.bold( '\nExample:\n' ) );
			console.log( 'vip dev-env <command> <arguments> --debug @automattic/vip:bin:dev-environment \n' );
		}

		debug( exception );
	}
}

export const validateDependencies = async () => {
	try {
		await validateDockerInstalled();
	} catch ( exception ) {
		exit.withError( exception.message );
	}
};

export function getEnvironmentName( options: EnvironmentNameOptions ): string {
	if ( options.slug ) {
		return options.slug;
	}

	if ( options.app ) {
		const envSuffix = options.env ? `-${ options.env }` : '';

		const appName = options.app + envSuffix;
		if ( options.allowAppEnv ) {
			return appName;
		}

		const message = `This command does not support @app.env notation. Use '--slug=${ appName }' to target the local environment.`;
		throw new UserError( message );
	}

	return DEFAULT_SLUG;
}

export function getEnvironmentStartCommand( slug: string ): string {
	if ( ! slug || slug === DEFAULT_SLUG ) {
		return `${ DEV_ENVIRONMENT_FULL_COMMAND } start`;
	}

	return `${ DEV_ENVIRONMENT_FULL_COMMAND } start --slug ${ slug }`;
}

export function printTable( data: Object ) {
	const formattedData = formatters.formatData( data, { format: 'table' }, { border: false } );

	console.log( formattedData );
}

export function processComponentOptionInput( passedParam: string, allowLocal: boolean ): ComponentConfig {
	// cast to string
	const param = passedParam + '';
	if ( allowLocal && param.includes( '/' ) ) {
		return {
			mode: 'local',
			dir: param,
		};
	}

	return {
		mode: 'image',
		tag: param,
	};
}

export function getOptionsFromAppInfo( appInfo: AppInfo ): InstanceOptions {
	return {
		title: appInfo.environment?.name || appInfo.name || '',
		multisite: !! appInfo?.environment?.isMultisite,
		mediaRedirectDomain: appInfo.environment?.primaryDomain,
	};
}

/**
 * Prompt for arguments
 * @param {InstanceOptions} preselectedOptions - options to be used without prompt
 * @param {InstanceOptions} defaultOptions - options to be used as default values for prompt
 * @returns {any} instance data
 */
export async function promptForArguments( preselectedOptions: InstanceOptions, defaultOptions: $Shape<InstanceOptions> ): Promise<InstanceData> {
	debug( 'Provided preselected', preselectedOptions, 'and default', defaultOptions );

	console.log( DEV_ENVIRONMENT_PROMPT_INTRO );

	let multisiteText = 'Multisite';
	let multisiteDefault = DEV_ENVIRONMENT_DEFAULTS.multisite;

	if ( defaultOptions.title ) {
		multisiteText += ` (${ defaultOptions.title } ${ defaultOptions.multisite ? 'IS' : 'is NOT' } multisite)`;
		multisiteDefault = defaultOptions.multisite;
	}

	const instanceData: InstanceData = {
		wpTitle: preselectedOptions.title || await promptForText( 'WordPress site title', defaultOptions.title || DEV_ENVIRONMENT_DEFAULTS.title ),
		multisite: 'multisite' in preselectedOptions ? preselectedOptions.multisite : await promptForBoolean( multisiteText, !! multisiteDefault ),
		elasticsearchEnabled: false,
		elasticsearch: preselectedOptions.elasticsearch || defaultOptions.elasticsearch || DEV_ENVIRONMENT_DEFAULTS.elasticsearchVersion,
		php: preselectedOptions.php ? resolvePhpVersion( preselectedOptions.php ) : await promptForPhpVersion( resolvePhpVersion( defaultOptions.php || DEV_ENVIRONMENT_DEFAULTS.phpVersion ) ),
		mariadb: preselectedOptions.mariadb || defaultOptions.mariadb || DEV_ENVIRONMENT_DEFAULTS.mariadbVersion,
		mediaRedirectDomain: preselectedOptions.mediaRedirectDomain || '',
		wordpress: {
			mode: 'image',
		},
		muPlugins: {
			mode: 'image',
		},
		appCode: {
			mode: 'image',
		},
		statsd: false,
		phpmyadmin: false,
		xdebug: false,
		siteSlug: '',
	};

	const promptLabels = {
		xdebug: 'XDebug',
		phpmyadmin: 'phpMyAdmin',
	};

	if ( ! instanceData.mediaRedirectDomain && defaultOptions.mediaRedirectDomain ) {
		const mediaRedirectPromptText = `Would you like to redirect to ${ defaultOptions.mediaRedirectDomain } for missing media files?`;
		const setMediaRedirectDomain = await promptForBoolean( mediaRedirectPromptText, true );
		if ( setMediaRedirectDomain ) {
			instanceData.mediaRedirectDomain = defaultOptions.mediaRedirectDomain ?? '';
		}
	}

	for ( const component of DEV_ENVIRONMENT_COMPONENTS ) {
		const option = ( preselectedOptions[ component ] ?? '' ).toString();
		const defaultValue = ( defaultOptions[ component ] ?? '' ).toString();

		const result = await processComponent( component, option, defaultValue );
		if ( null === result ) {
			throw new Error( 'processComponent() returned null' );
		}

		instanceData[ component ] = result;
	}

	debug( `Processing elasticsearch with preselected "${ preselectedOptions.elasticsearch }"` );
	if ( 'elasticsearch' in preselectedOptions ) {
		instanceData.elasticsearchEnabled = !! preselectedOptions.elasticsearch;
	} else {
		instanceData.elasticsearchEnabled = await promptForBoolean( 'Enable Elasticsearch (needed by Enterprise Search)?', defaultOptions.elasticsearchEnabled );
	}

	if ( instanceData.elasticsearchEnabled ) {
		instanceData.statsd = preselectedOptions.statsd || defaultOptions.statsd || false;
	} else {
		instanceData.statsd = false;
	}

	for ( const service of [ 'phpmyadmin', 'xdebug' ] ) {
		if ( service in instanceData ) {
			if ( service in preselectedOptions ) {
				instanceData[ service ] = preselectedOptions[ service ];
			} else {
				instanceData[ service ] = await promptForBoolean( `Enable ${ promptLabels[ service ] || service }`, instanceData[ service ] );
			}
		}
	}

	debug( 'Instance data after prompts', instanceData );
	return instanceData;
}

async function processComponent( component: string, preselectedValue: string, defaultValue: string ) {
	debug( `processing a component '${ component }', with preselected/deafault - ${ preselectedValue }/${ defaultValue }` );
	let result = null;

	const allowLocal = component !== 'wordpress';
	const defaultObject = defaultValue ? processComponentOptionInput( defaultValue, allowLocal ) : null;
	if ( preselectedValue ) {
		result = processComponentOptionInput( preselectedValue, allowLocal );
	} else {
		result = await promptForComponent( component, allowLocal, defaultObject );
	}

	while ( 'local' === result?.mode ) {
		const resolvedPath = resolvePath( result.dir || '' );
		result.dir = resolvedPath;

		const { result: isPathValid, message } = validateLocalPath( component, resolvedPath );

		if ( isPathValid ) {
			break;
		} else {
			console.log( chalk.yellow( 'Warning:' ), message );
			result = await promptForComponent( component, allowLocal, defaultObject );
		}
	}

	return result;
}

function validateLocalPath( component: string, providedPath: string ) {
	if ( ! isNonEmptyDirectory( providedPath ) ) {
		const message = `Provided path "${ providedPath }" does not point to a valid or existing directory.`;
		return {
			result: false,
			message,
		};
	}

	if ( component === 'appCode' ) {
		const files = [ 'languages', 'plugins', 'themes', 'private', 'images', 'client-mu-plugins', 'vip-config' ];

		const missingFiles = [];
		for ( const file of files ) {
			const filePath = path.resolve( providedPath, file );
			if ( ! fs.existsSync( filePath ) ) {
				missingFiles.push( file );
			}
		}
		if ( missingFiles.length > 0 ) {
			const message = `Provided path "${ providedPath }" is missing following files/folders: ${ missingFiles.join( ', ' ) }. Learn more: https://docs.wpvip.com/technical-references/vip-codebase/#1-wordpress`;
			return {
				result: false,
				message,
			};
		}
	}

	return {
		result: true,
		message: '',
	};
}

function isNonEmptyDirectory( directoryPath: string ) {
	const isDirectory = directoryPath && fs.existsSync( directoryPath ) && fs.lstatSync( directoryPath ).isDirectory();
	const isEmpty = isDirectory ? fs.readdirSync( directoryPath ).length === 0 : true;

	return ! isEmpty && isDirectory;
}

export function resolvePath( input: string ): string {
	// Resolve does not do ~ reliably
	const resolvedPath = input.replace( /^~/, os.homedir() );
	// And resolve to handle relative paths
	return path.resolve( resolvedPath );
}

export async function promptForText( message: string, initial: string ): Promise<string> {
	const nonEmptyValidator = value => {
		if ( ( value || '' ).trim() ) {
			return true;
		}
		return 'value needs to be provided';
	};

	const result = await prompt( {
		type: 'input',
		name: 'input',
		message,
		initial,
		validate: nonEmptyValidator,
	} );

	return ( result?.input || '' ).trim();
}

export async function promptForBoolean( message: string, initial: boolean ): Promise<boolean> {
	const confirm = new Confirm( {
		message,
		initial,
	} );

	return confirm.run();
}

function resolvePhpVersion( version: string ): string {
	debug( `Resolving PHP version '${ version }'` );
	const versions = Object.keys( DEV_ENVIRONMENT_PHP_VERSIONS );
	const images = ( ( Object.values( DEV_ENVIRONMENT_PHP_VERSIONS ): any[] ): string[] );

	// eslint-disable-next-line eqeqeq -- use loose comparison because commander resolves '8.0' to '8'
	const index = versions.findIndex( value => value == version );
	if ( index === -1 ) {
		const image = images.find( value => value === version );
		return image ?? images[ 0 ];
	}

	return images[ index ];
}

export async function promptForPhpVersion( initialValue: string ): Promise<string> {
	debug( `Prompting for PHP version, preselected option is ${ initialValue }` );

	const choices = Object.keys( DEV_ENVIRONMENT_PHP_VERSIONS );
	const images = Object.values( DEV_ENVIRONMENT_PHP_VERSIONS );
	const initial = images.findIndex( version => version === initialValue );

	const select = new Select( {
		message: 'PHP version to use',
		choices,
		initial,
	} );

	const answer = await select.run();
	return resolvePhpVersion( answer );
}

const componentDisplayNames = {
	wordpress: 'WordPress',
	muPlugins: 'vip-go-mu-plugins',
	appCode: 'application code',
};

export async function promptForComponent( component: string, allowLocal: boolean, defaultObject: ComponentConfig | null ): Promise<ComponentConfig> {
	debug( `Prompting for ${ component } with default:`, defaultObject );
	const componentDisplayName = componentDisplayNames[ component ] || component;
	const modChoices = [];

	if ( allowLocal ) {
		modChoices.push( {
			message: `local folder - where you already have ${ componentDisplayName }`,
			value: 'local',
		} );
	}
	modChoices.push( {
		message: 'demo image - that gets automatically fetched',
		value: 'image',
	} );

	let initialMode = 'image';
	if ( 'appCode' === component ) {
		initialMode = 'local';
	}

	if ( defaultObject?.mode ) {
		initialMode = defaultObject.mode;
	}

	let modeResult = initialMode;
	const selectMode = modChoices.length > 1;
	if ( selectMode ) {
		const initialModeIndex = modChoices.findIndex( choice => choice.value === initialMode );
		const select = new Select( {
			message: `How would you like to source ${ componentDisplayName }`,
			choices: modChoices,
			initial: initialModeIndex,
		} );

		modeResult = await select.run();
	}

	const messagePrefix = selectMode ? '\t' : `${ componentDisplayName } - `;
	if ( 'local' === modeResult ) {
		const directoryPath = await promptForText( `${ messagePrefix }What is a path to your local ${ componentDisplayName }`, defaultObject?.dir || '' );
		return {
			mode: modeResult,
			dir: directoryPath,
		};
	}

	// image with selection
	if ( component === 'wordpress' ) {
		const message = `${ messagePrefix }Which version would you like`;
		const tagChoices = await getTagChoices();
		const selectTag = new Select( {
			message,
			choices: tagChoices,
		} );
		const option = await selectTag.run();

		return {
			mode: modeResult,
			tag: option,
		};
	}

	// image
	return {
		mode: modeResult,
	};
}

const FALSE_OPTIONS = [ 'false', 'no', 'n', '0' ];
export function processBooleanOption( value: string ): boolean {
	if ( ! value ) {
		return false;
	}

	if ( FALSE_OPTIONS.includes( value.toLowerCase?.() ) ) {
		return false;
	}

	return true;
}

export function addDevEnvConfigurationOptions( command ) {
	return command
		.option( 'wordpress', 'Use a specific WordPress version' )
		.option( [ 'u', 'mu-plugins' ], 'Use a specific mu-plugins changeset or local directory' )
		.option( 'app-code', 'Use the application code from a local directory or use "demo" for VIP skeleton code' )
		.option( 'statsd', 'Enable statsd component. By default it is disabled', undefined, processBooleanOption )
		.option( 'phpmyadmin', 'Enable PHPMyAdmin component. By default it is disabled', undefined, processBooleanOption )
		.option( 'xdebug', 'Enable XDebug. By default it is disabled', undefined, processBooleanOption )
		.option( 'elasticsearch', 'Explicitly choose Elasticsearch version to use or false to disable it', undefined, value => FALSE_OPTIONS.includes( value?.toLowerCase?.() ) ? false : value )
		.option( 'mariadb', 'Explicitly choose MariaDB version to use' )
		.option( [ 'r', 'media-redirect-domain' ], 'Domain to redirect for missing media files. This can be used to still have images without the need to import them locally.' )
		.option( 'php', 'Explicitly choose PHP version to use' );
}

/**
 * Provides the list of tag choices for selection
 */
export async function getTagChoices() {
	const versions = await getVersionList();
	if ( versions.length < 1 ) {
		return [ '5.9', '5.8', '5.7', '5.6', '5.5' ];
	}

	return versions.map( version => {
		let mapping;
		const tagFormatted = version.tag.padEnd( 8 - version.tag.length );
		const prerelease = version.prerelease ? '(Pre-Release)' : '';

		if ( version.tag !== version.ref ) {
			mapping = `→ ${ prerelease } ${ version.ref }`;
		} else {
			mapping = '';
		}

		return {
			name: version.tag,
			message: `${ tagFormatted } ${ mapping }`,
			value: version.tag,
		};
	} );
}

export function getEnvTrackingInfo( slug: string ): any {
	try {
		const envData = readEnvironmentData( slug );
		const result = { slug };
		for ( const key of Object.keys( envData ) ) {
			// track doesnt like camelCase
			const snakeCasedKey = key.replace( /[A-Z]/g, letter => `_${ letter.toLowerCase() }` );
			const value = DEV_ENVIRONMENT_COMPONENTS.includes( key ) ? JSON.stringify( envData[ key ] ) : envData[ key ];

			result[ snakeCasedKey ] = value;
		}

		result.php = result.php?.replace( /.*:/, '' );

		return result;
	} catch ( err ) {
		return {
			slug,
		};
	}
}
