import chalk from 'chalk';
import { spawn } from 'child_process';
import debugLib from 'debug';
import { prompt, Confirm, Select } from 'enquirer';
import Lando from 'lando';
import formatters from 'lando/lib/formatters';
import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'path';
import { which } from 'shelljs';

import { getConfigurationFileOptions } from './dev-environment-configuration-file';
import {
	generateVSCodeWorkspace,
	getAllEnvironmentNames,
	getVSCodeWorkspacePath,
	getVersionList,
	readEnvironmentData,
} from './dev-environment-core';
import { validateDockerInstalled } from './dev-environment-lando';
import { Args } from '../cli/command';
import {
	DEV_ENVIRONMENT_FULL_COMMAND,
	DEV_ENVIRONMENT_DEFAULTS,
	DEV_ENVIRONMENT_PROMPT_INTRO,
	DEV_ENVIRONMENT_COMPONENTS,
	DEV_ENVIRONMENT_NOT_FOUND,
	DEV_ENVIRONMENT_PHP_VERSIONS,
	DEV_ENVIRONMENT_COMPONENTS_WITH_WP,
} from '../constants/dev-environment';
import { trackEvent } from '../tracker';
import UserError from '../user-error';

import type {
	AppInfo,
	ComponentConfig,
	InstanceOptions,
	EnvironmentNameOptions,
	InstanceData,
	WordPressConfig,
	ConfigurationFileOptions,
} from './types';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

export const DEFAULT_SLUG = 'vip-local';
export const CONFIGURATION_FOLDER = '.wpvip';

let isStdinTTY: boolean = Boolean( process.stdin.isTTY );

/**
 * Used internally for tests
 *
 * @param {boolean} val Value to set
 */
export function setIsTTY( val: boolean ): void {
	isStdinTTY = val;
}

const componentDisplayNames: Record<
	( typeof DEV_ENVIRONMENT_COMPONENTS_WITH_WP )[ number ],
	string
> = {
	wordpress: 'WordPress',
	muPlugins: 'vip-go-mu-plugins',
	appCode: 'application code',
} as const;

const componentDemoNames: Record< ( typeof DEV_ENVIRONMENT_COMPONENTS )[ number ], string > = {
	muPlugins: 'vip-go-mu-plugins',
	appCode: 'vip-go-skeleton',
} as const;

export async function handleCLIException(
	exception: Error,
	trackKey?: string,
	trackBaseInfo: Record< string, unknown > = {}
) {
	const errorPrefix = chalk.red( 'Error:' );
	if ( DEV_ENVIRONMENT_NOT_FOUND === exception.message ) {
		const createCommand = chalk.bold( DEV_ENVIRONMENT_FULL_COMMAND + ' create' );

		const message = `Environment doesn't exist.\n\n\nTo create a new environment run:\n\n${ createCommand }\n`;
		console.error( errorPrefix, message );
	} else if ( exception instanceof UserError ) {
		// User errors are handled in global error handler
		throw exception;
	} else {
		let message = exception.message;
		// if the message has already ERROR prefix we should drop it as we are adding our own cool red Error-prefix
		message = message.replace( 'ERROR: ', '' );

		console.error( errorPrefix, message );

		if ( trackKey ) {
			const errorTrackingInfo = { ...trackBaseInfo, failure: message, stack: exception.stack };
			// trackEvent does not throw
			await trackEvent( trackKey, errorTrackingInfo );
		}

		if ( ! process.env.DEBUG ) {
			console.error(
				`\nPlease re-run the command with "--debug ${ chalk.bold(
					'@automattic/vip:bin:dev-environment'
				) }" appended to it and provide the stack trace on the support ticket.`
			);
			console.error( chalk.bold( '\nExample:\n' ) );
			console.error(
				'vip dev-env <command> <arguments> --debug @automattic/vip:bin:dev-environment \n'
			);
		}

		debug( exception );
	}
}

export const validateDependencies = ( lando: Lando ) => {
	const now = new Date();

	validateDockerInstalled( lando );
	const duration = new Date().getTime() - now.getTime();
	debug( 'Validation checks completed in %d ms', duration );
};

export async function getEnvironmentName( options: EnvironmentNameOptions ): Promise< string > {
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

	const configurationFileOptions = await getConfigurationFileOptions();

	if ( configurationFileOptions.slug && configurationFileOptions.meta ) {
		const slug = configurationFileOptions.slug;
		console.log(
			`Using environment ${ chalk.blue.bold( slug ) } from ${ chalk.gray(
				configurationFileOptions.meta[ 'configuration-path' ]
			) }\n`
		);

		return slug;
	}

	const envs = getAllEnvironmentNames();
	if ( envs.length === 1 ) {
		return envs[ 0 ];
	}
	if ( envs.length > 1 && typeof options.slug !== 'string' ) {
		const msg = `More than one environment found: ${ chalk.blue.bold(
			envs.join( ', ' )
		) }. Please re-run command with the --slug parameter for the targeted environment.`;
		throw new UserError( msg );
	}

	return DEFAULT_SLUG; // Fall back to the default slug if we don't have any, e.g. during the env creation purpose
}

export function getEnvironmentStartCommand(
	slug: string,
	configurationFileOptions: ConfigurationFileOptions
): string {
	const isUsingConfigurationFileSlug =
		Object.keys( configurationFileOptions ).length > 0 && configurationFileOptions.slug === slug;

	if ( ! slug || isUsingConfigurationFileSlug ) {
		return `${ DEV_ENVIRONMENT_FULL_COMMAND } start`;
	}

	return `${ DEV_ENVIRONMENT_FULL_COMMAND } start --slug ${ slug }`;
}

export function printTable( data: Record< string, unknown > ) {
	const formattedData = formatters.formatData( data, { format: 'table' }, { border: false } );

	console.log( formattedData );
}

interface LocalComponent {
	mode: 'local';
	dir: string;
}

interface ImageComponent {
	mode: 'image';
	tag: string | undefined;
}

export function processComponentOptionInput(
	passedParam: string,
	allowLocal: false
): ImageComponent;
export function processComponentOptionInput(
	passedParam: string,
	allowLocal: true
): LocalComponent | ImageComponent;
export function processComponentOptionInput(
	passedParam: string,
	allowLocal: boolean
): LocalComponent | ImageComponent {
	// cast to string
	const param = String( passedParam );
	// This is a bit of a naive check
	if ( allowLocal && /[\\/]/.test( param ) ) {
		return {
			mode: 'local',
			dir: param,
		};
	}

	return {
		mode: 'image',
		tag: param === 'demo' ? undefined : param,
	};
}

export function getOptionsFromAppInfo( appInfo: AppInfo ): InstanceOptions {
	return {
		// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
		title: appInfo.environment?.name || appInfo.name || '', // NOSONAR
		multisite: Boolean( appInfo.environment?.isMultisite ),
		mediaRedirectDomain: appInfo.environment?.primaryDomain,
		php: appInfo.environment?.php ?? '',
		wordpress: appInfo.environment?.wordpress ?? '',
	};
}

/**
 * Prompt for arguments
 *
 * @param {InstanceOptions} preselectedOptions - options to be used without prompt
 * @param {InstanceOptions} defaultOptions     - options to be used as default values for prompt
 * @param {boolean}         suppressPrompts    - supress prompts and use default values where needed
 * @return {any} instance data
 */
// eslint-disable-next-line complexity
export async function promptForArguments(
	preselectedOptions: InstanceOptions,
	defaultOptions: InstanceOptions,
	suppressPrompts: boolean,
	create: boolean
): Promise< InstanceData > {
	debug( 'Provided preselected', preselectedOptions, 'and default', defaultOptions );

	if ( suppressPrompts ) {
		preselectedOptions = { ...defaultOptions, ...preselectedOptions };
	} else {
		console.log( DEV_ENVIRONMENT_PROMPT_INTRO );
	}

	let multisiteText = 'Multisite';
	if ( defaultOptions.title ) {
		multisiteText += ` (${ defaultOptions.title } ${
			defaultOptions.multisite ? 'IS' : 'is NOT'
		} multisite)`;
	}

	const instanceData: InstanceData = {
		wpTitle:
			preselectedOptions.title ??
			( await promptForText(
				'WordPress site title',
				defaultOptions.title ?? DEV_ENVIRONMENT_DEFAULTS.title
			) ),
		multisite: resolveMultisite(
			preselectedOptions.multisite ??
				( await promptForMultisite(
					multisiteText,
					defaultOptions.multisite ?? DEV_ENVIRONMENT_DEFAULTS.multisite
				) )
		),
		elasticsearch: false,
		php: preselectedOptions.php
			? resolvePhpVersion( preselectedOptions.php )
			: await promptForPhpVersion(
					resolvePhpVersion( defaultOptions.php ?? DEV_ENVIRONMENT_DEFAULTS.phpVersion )
			  ),
		mariadb: preselectedOptions.mariadb ?? defaultOptions.mariadb,
		mediaRedirectDomain: preselectedOptions.mediaRedirectDomain ?? '',
		wordpress: {
			mode: 'image',
			tag: '',
		},
		muPlugins: {
			mode: 'image',
		},
		appCode: {
			mode: 'image',
		},
		phpmyadmin: false,
		xdebug: false,
		xdebugConfig: preselectedOptions.xdebugConfig,
		siteSlug: '',
		mailpit: false,
		photon: false,
		cron: false,
	};

	const promptLabels = {
		xdebug: 'XDebug',
		phpmyadmin: 'phpMyAdmin',
		mailpit: 'Mailpit',
		photon: 'Photon',
		cron: 'Cron',
	};

	if ( create && ! instanceData.mediaRedirectDomain && defaultOptions.mediaRedirectDomain ) {
		const mediaRedirectPromptText = `Would you like to redirect to ${ defaultOptions.mediaRedirectDomain } for missing media files?`;
		const setMediaRedirectDomain = await promptForBoolean( mediaRedirectPromptText, true );
		if ( setMediaRedirectDomain ) {
			instanceData.mediaRedirectDomain = defaultOptions.mediaRedirectDomain;
		}
	}

	instanceData.wordpress = await processWordPress(
		( preselectedOptions.wordpress ?? '' ).toString(),
		( defaultOptions.wordpress ?? '' ).toString()
	);

	for ( const component of DEV_ENVIRONMENT_COMPONENTS ) {
		const option = ( preselectedOptions[ component ] ?? '' ).toString();
		const defaultValue = ( defaultOptions[ component ] ?? '' ).toString();

		// eslint-disable-next-line no-await-in-loop
		const result = await processComponent( component, option, defaultValue, suppressPrompts );
		instanceData[ component ] = result;
	}

	debug( `Processing elasticsearch with preselected "%s"`, preselectedOptions.elasticsearch );
	if ( 'elasticsearch' in preselectedOptions ) {
		instanceData.elasticsearch = Boolean( preselectedOptions.elasticsearch );
	} else {
		instanceData.elasticsearch = await promptForBoolean(
			'Enable Elasticsearch (needed by Enterprise Search)?',
			Boolean( defaultOptions.elasticsearch )
		);
	}

	const services = [ 'phpmyadmin', 'xdebug', 'mailpit', 'photon', 'cron' ] as const;
	for ( const service of services ) {
		if ( service in instanceData ) {
			const preselected = preselectedOptions[ service ];
			if ( preselected !== undefined ) {
				instanceData[ service ] = preselected;
			} else {
				// eslint-disable-next-line no-await-in-loop
				instanceData[ service ] = await promptForBoolean(
					`Enable ${ promptLabels[ service ] || service }`,
					Boolean( defaultOptions[ service ] )
				);
			}
		}
	}

	debug( 'Instance data after prompts', instanceData );
	return instanceData;
}

async function processWordPress(
	preselectedValue: string,
	defaultValue: string
): Promise< WordPressConfig > {
	debug(
		`processing 'WordPress', with preselected/default - ${ preselectedValue }/${ defaultValue }`
	);

	let result: WordPressConfig;
	const allowLocal = false;
	const defaultObject = defaultValue
		? ( processComponentOptionInput( defaultValue, allowLocal ) as WordPressConfig )
		: null;
	if ( preselectedValue ) {
		result = processComponentOptionInput( preselectedValue, allowLocal ) as WordPressConfig;
	} else {
		result = await promptForWordPress( defaultObject );
	}

	const versions = await getVersionList();
	if ( versions.length ) {
		versions.sort( ( before, after ) => ( before.tag < after.tag ? 1 : -1 ) );
		const match = versions.find( ( { tag } ) => tag === result.tag );

		if ( typeof match === 'undefined' ) {
			throw new UserError( `Unknown or unsupported WordPress version: ${ result.tag }.` );
		}
	}

	debug( result );
	return result;
}

async function processComponent(
	component: keyof typeof componentDemoNames,
	preselectedValue: string,
	defaultValue: string,
	suppressPrompts: boolean = false
): Promise< ComponentConfig > {
	debug(
		`processing a component '${ component }', with preselected/default - ${ preselectedValue }/${ defaultValue }`
	);
	let result: ComponentConfig;

	const allowLocal = true;
	const defaultObject = defaultValue
		? processComponentOptionInput( defaultValue, allowLocal )
		: null;
	if ( preselectedValue ) {
		result = processComponentOptionInput( preselectedValue, allowLocal );

		if ( ! suppressPrompts ) {
			console.log(
				`${ chalk.green( '✓' ) } Path to your local ${
					componentDisplayNames[ component ]
				}: ${ preselectedValue }`
			);
		}
	} else {
		result = await promptForComponent( component, allowLocal, defaultObject );
	}

	debug( result );

	while ( 'local' === result.mode ) {
		const resolvedPath = resolvePath( result.dir ?? '' );
		result.dir = resolvedPath;

		const { result: isPathValid, message } = validateLocalPath( component, resolvedPath );

		if ( isPathValid ) {
			break;
		} else if ( isStdinTTY ) {
			console.log( chalk.yellow( 'Warning:' ), message );
			// eslint-disable-next-line no-await-in-loop
			result = await promptForComponent( component, allowLocal, defaultObject );
		} else {
			throw new Error( message );
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
		const files = [
			'languages',
			'plugins',
			'themes',
			'private',
			'images',
			'client-mu-plugins',
			'vip-config',
		];

		const missingFiles = [];
		for ( const file of files ) {
			const filePath = path.resolve( providedPath, file );
			if ( ! existsSync( filePath ) ) {
				missingFiles.push( file );
			}
		}
		if ( missingFiles.length > 0 ) {
			// eslint-disable-next-line max-len
			const message = `Provided path "${ providedPath }" is missing following files/folders: ${ missingFiles.join(
				', '
			) }. Learn more: https://docs.wpvip.com/wordpress-skeleton/`;
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
	const isDirectory =
		directoryPath && existsSync( directoryPath ) && lstatSync( directoryPath ).isDirectory();
	const isEmpty = isDirectory ? readdirSync( directoryPath ).length === 0 : true;

	return ! isEmpty && isDirectory;
}

export function resolvePath( input: string ): string {
	// Resolve does not do ~ reliably
	const resolvedPath = input.replace( /^~/, homedir() );
	// And resolve to handle relative paths
	return path.resolve( resolvedPath );
}

export async function promptForText( message: string, initial: string ): Promise< string > {
	interface PromptResult {
		input: string;
	}

	let result: PromptResult = { input: initial };
	if ( isStdinTTY ) {
		const nonEmptyValidator = ( value: string ) => {
			if ( ( value || '' ).trim() ) {
				return true;
			}
			return 'value needs to be provided';
		};

		result = await prompt< PromptResult >( {
			type: 'input',
			name: 'input',
			message,
			initial,
			validate: nonEmptyValidator,
		} );
	}

	return ( result.input || '' ).trim();
}

const multisiteOptions = [ 'subdomain', 'subdirectory' ] as const;

export async function promptForMultisite(
	message: string,
	initial: string | boolean
): Promise< string | boolean > {
	interface Answer {
		input: string | boolean;
	}

	interface StringAnswer {
		input: string;
	}

	// `undefined` is used here only because our tests need overhauling
	let result: Answer | StringAnswer | undefined = { input: initial };

	if ( isStdinTTY ) {
		result = await prompt< StringAnswer | undefined >( {
			type: 'input',
			name: 'input',
			message,
			initial,
		} );
	}

	let input = ( result?.input ?? initial ).toString().trim();
	const allowedOptions = [
		...FALSE_OPTIONS,
		...TRUE_OPTIONS,
		...multisiteOptions,
		'none',
	] as const;

	if ( ! ( allowedOptions as readonly string[] ).includes( input ) && isStdinTTY ) {
		const select = new Select( {
			message: `Please choose a valid option for multisite:`,
			choices: [ ...multisiteOptions, 'false' ],
		} );

		input = await select.run();
	}

	return processStringOrBooleanOption( input );
}

export function promptForBoolean( message: string, initial: boolean ): Promise< boolean > {
	if ( isStdinTTY ) {
		const confirm = new Confirm( {
			message,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-assignment
			initial: initial as any, // TS definition is wrong, so we need to bypass it to show the correct hint.
		} );

		return confirm.run();
	}

	return Promise.resolve( initial );
}

function resolveMultisite( value: string | boolean ): 'subdomain' | 'subdirectory' | boolean {
	const isMultisiteOption = (
		val: unknown
	): val is ( typeof multisiteOptions )[ number ] | boolean =>
		( typeof val === 'string' && ( multisiteOptions as readonly string[] ).includes( val ) ) ||
		typeof val === 'boolean';

	return isMultisiteOption( value ) ? value : DEV_ENVIRONMENT_DEFAULTS.multisite;
}

export function resolvePhpVersion( version: string ): string {
	// It is painful to rewrite tests :-(
	if ( version === '' ) {
		return '';
	}

	debug( `Resolving PHP version %j`, version );

	let result: string;
	if ( ! ( version in DEV_ENVIRONMENT_PHP_VERSIONS ) ) {
		const images = Object.values( DEV_ENVIRONMENT_PHP_VERSIONS );
		const image = images.find( value => value.image === version );
		if ( image ) {
			result = image.image;
		} else {
			throw new UserError( `Unknown or unsupported PHP version: ${ version }.` );
		}
	} else {
		result = DEV_ENVIRONMENT_PHP_VERSIONS[ version ].image;
	}

	debug( 'Resolved PHP image: %j', result );
	return result;
}

export async function promptForPhpVersion( initialValue: string ): Promise< string > {
	debug( `Prompting for PHP version, preselected option is ${ initialValue }` );

	let answer = initialValue;
	if ( isStdinTTY ) {
		const choices = [];
		Object.keys( DEV_ENVIRONMENT_PHP_VERSIONS ).forEach( version => {
			const phpImage = DEV_ENVIRONMENT_PHP_VERSIONS[ version ];
			choices.push( { message: phpImage.label, value: version } );
		} );
		const images = Object.values( DEV_ENVIRONMENT_PHP_VERSIONS );
		let initial = images.findIndex( version => version.image === initialValue );
		if ( initial === -1 ) {
			choices.push( { message: initialValue, value: initialValue } );
			initial = choices.length - 1;
		}

		const select = new Select( {
			message: 'PHP version to use',
			choices,
			initial,
		} );

		answer = await select.run();
	}

	return resolvePhpVersion( answer );
}

export async function promptForWordPress(
	defaultObject: WordPressConfig | string | null
): Promise< WordPressConfig > {
	debug( `Prompting for wordpress with default:`, defaultObject );
	const componentDisplayName = componentDisplayNames.wordpress;

	const messagePrefix = `${ componentDisplayName } - `;

	// image with selection
	const tagChoices = await getTagChoices();

	if (
		typeof defaultObject === 'string' &&
		! tagChoices.find( choice => choice.value === defaultObject )
	) {
		throw new Error( `Unknown or unsupported WordPress version: ${ defaultObject }.` );
	}

	let option =
		typeof defaultObject === 'string' ? defaultObject : defaultObject?.tag ?? tagChoices[ 0 ].value;

	if ( isStdinTTY ) {
		const message = `${ messagePrefix }Which version would you like`;
		const selectTag = new Select( {
			message,
			choices: tagChoices,
			initial: option,
		} );

		option = await selectTag.run();
	}

	return {
		mode: 'image',
		tag: option,
	};
}

export async function promptForComponent(
	component: ( typeof DEV_ENVIRONMENT_COMPONENTS )[ number ],
	allowLocal: boolean,
	defaultObject: ComponentConfig | null
): Promise< ComponentConfig > {
	debug( `Prompting for ${ component } with default:`, defaultObject );
	const componentDisplayName = componentDisplayNames[ component ] || component;
	const componentDemoName = componentDemoNames[ component ];
	const modChoices = [];

	if ( allowLocal ) {
		modChoices.push( {
			message: `Custom - Path to a locally cloned ${ componentDisplayName } directory`,
			value: 'local',
		} );
	}
	modChoices.push( {
		message: `Demo - Automatically fetched ${ componentDemoName }`,
		value: 'image',
	} );

	let initialMode: 'image' | 'local' = 'image';
	if ( 'appCode' === component && isStdinTTY ) {
		initialMode = 'local';
	}

	if ( defaultObject?.mode ) {
		initialMode = defaultObject.mode;
	}

	let modeResult = initialMode;
	const selectMode = modChoices.length > 1;
	if ( selectMode && isStdinTTY ) {
		const initialModeIndex = modChoices.findIndex( choice => choice.value === initialMode );
		const select = new Select( {
			message: `How would you like to source ${ componentDisplayName }`,
			choices: modChoices,
			initial: initialModeIndex,
		} );

		modeResult = ( await select.run() ) as typeof modeResult;
	}

	debug( modeResult );

	const messagePrefix = selectMode ? '\t' : `${ componentDisplayName } - `;
	if ( 'local' === modeResult ) {
		const directoryPath = await promptForText(
			`${ messagePrefix }What is a path to your local ${ componentDisplayName }`,
			defaultObject?.dir ?? ''
		);
		return {
			mode: modeResult,
			dir: directoryPath,
		};
	}

	// image
	return {
		mode: modeResult,
	};
}

const FALSE_OPTIONS = [ 'false', 'no', 'n', '0' ] as const;
const TRUE_OPTIONS = [ 'true', 'yes', 'y', '1' ] as const;

declare global {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	interface ReadonlyArray< T > {
		/**
		 * Determines whether an array includes a certain element, returning true or false as appropriate.
		 * @param searchElement The element to search for.
		 * @param fromIndex The position in this array at which to begin searching for searchElement.
		 */
		includes( searchElement: unknown, fromIndex?: number ): boolean;
	}
}

export function processBooleanOption( value: unknown ): boolean {
	if ( ! value ) {
		return false;
	}

	// eslint-disable-next-line @typescript-eslint/no-base-to-string
	return ! FALSE_OPTIONS.includes( value.toString().toLowerCase() ); // NOSONAR
}

export function processMediaRedirectDomainOption( value: unknown ): string {
	// eslint-disable-next-line @typescript-eslint/no-base-to-string
	const val = ( value ?? '' ).toString();

	if ( FALSE_OPTIONS.includes( val.toLowerCase() ) ) {
		return '';
	}

	if ( TRUE_OPTIONS.includes( val.toLowerCase() ) ) {
		throw new UserError( 'Media redirect domain must be a domain name or an URL' );
	}

	return val;
}

export function processStringOrBooleanOption( value: string | boolean ): string | boolean {
	if ( typeof value === 'boolean' ) {
		return value;
	}

	if ( ! value || FALSE_OPTIONS.includes( value.toLowerCase() ) ) {
		return false;
	}

	if ( TRUE_OPTIONS.includes( value.toLowerCase() ) ) {
		return true;
	}

	return value;
}

export function processSlug( value: unknown ): string {
	// eslint-disable-next-line @typescript-eslint/no-base-to-string
	return ( value ?? '' ).toString().toLowerCase();
}

declare function isNaN( value: unknown ): boolean;
declare function parseFloat( value: unknown ): number;

export function processVersionOption( value: unknown ): string {
	if ( typeof value === 'string' || typeof value === 'number' ) {
		if ( ! isNaN( value ) && Number( value ) % 1 === 0 ) {
			return parseFloat( value ).toFixed( 1 );
		}
	}

	return value?.toString() ?? '';
}

const phpVersionsSupported: string = Object.keys( DEV_ENVIRONMENT_PHP_VERSIONS ).join( ', ' );

export function addDevEnvConfigurationOptions( command: Args ): Args {
	// We leave the third parameter to undefined on some because the defaults are handled in preProcessInstanceData()
	return command
		.option(
			'wordpress',
			'Manage the version of WordPress. Accepts a string value for major versions (6.x). Defaults to the most recent version of WordPress.',
			undefined,
			processVersionOption
		)
		.option(
			[ 'u', 'mu-plugins' ],
			'Manage the source for VIP MU plugins. Accepts "demo" (default) for a read-only image of the staging branch, or a path to a built copy of VIP MU plugins on the local machine.'
		)
		.option(
			'app-code',
			'Manage the source for application code. Accepts "demo" (default) for a read-only image of WordPress VIP skeleton application code, or a path to a VIP formatted application repo on the local machine.'
		)
		.option(
			'phpmyadmin',
			'Enable or disable phpMyAdmin, disabled by default. Accepts "y" (default value) to enable or "n" to disable. When enabled, refer to the value of "PHPMYADMIN URLS" in the information output for a local environment for the URL to access phpMyAdmin.',
			undefined,
			processBooleanOption
		)
		.option(
			'xdebug',
			'Enable or disable XDebug, disabled by default. Accepts "y" (default value) to enable or "n" to disable.',
			undefined,
			processBooleanOption
		)
		.option(
			'xdebug_config',
			'Override some default configuration settings for Xdebug. Accepts a string value that is assigned to the XDEBUG_CONFIG environment variable.'
		)
		.option(
			'elasticsearch',
			'Enable or disable Elasticsearch (required by Enterprise Search), disabled by default. Accepts "y" (default value) to enable or "n" to disable.',
			undefined,
			processBooleanOption
		)
		.option(
			[ 'r', 'media-redirect-domain' ],
			'Configure media files to be proxied from a VIP Platform environment. Accepts a string value for the primary domain of the VIP Platform environment or "n" to disable the media proxy.',
			undefined,
			processMediaRedirectDomainOption
		)
		.option(
			'php',
			`Manage the version of PHP. Accepts a string value for minor versions: ${ phpVersionsSupported }`,
			undefined,
			processVersionOption
		)
		.option(
			'cron',
			'Enable or disable cron, disabled by default. Accepts "y" (default value) to enable or "n" to disable.',
			undefined,
			processBooleanOption
		)
		.option(
			[ 'A', 'mailpit' ],
			'Enable or disable Mailpit, disabled by default. Accepts "y" (default value) to enable or "n" to disable.',
			undefined,
			processBooleanOption
		)
		.option(
			[ 'H', 'photon' ],
			'Enable or disable Photon, disabled by default. Accepts "y" (default value) to enable or "n" to disable.',
			undefined,
			processBooleanOption
		);
}

/**
 * Provides the list of tag choices for selection
 */
export async function getTagChoices(): Promise<
	{ name: string; message: string; value: string }[]
> {
	let versions = await getVersionList();
	if ( versions.length < 1 ) {
		versions = [
			{
				ref: '6.1.1',
				tag: '6.1',
				cacheable: true,
				locked: true,
				prerelease: false,
			},
			{
				ref: '6.0.3',
				tag: '6.0',
				cacheable: true,
				locked: true,
				prerelease: false,
			},
			{
				ref: '5.9.5',
				tag: '5.9',
				cacheable: true,
				locked: true,
				prerelease: false,
			},
		];
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

export function getEnvTrackingInfo( slug: string ): Record< string, unknown > {
	try {
		const envData = readEnvironmentData( slug );
		const result: Record< string, unknown > = { slug };
		for ( const key of Object.keys( envData ) ) {
			// track doesn't like camelCase
			const snakeCasedKey = key.replace( /[A-Z]/g, letter => `_${ letter.toLowerCase() }` );
			const value = ( DEV_ENVIRONMENT_COMPONENTS_WITH_WP as readonly string[] ).includes( key )
				? JSON.stringify( envData[ key ] )
				: envData[ key ];

			result[ snakeCasedKey ] = value;
		}

		result.php = ( result.php as string ).replace( /^[^:]+:/, '' );

		return result;
	} catch ( err ) {
		return {
			slug,
		};
	}
}

export interface PostStartOptions {
	openVSCode: boolean;
}

export function postStart( slug: string, options: PostStartOptions ): void {
	if ( options.openVSCode ) {
		launchVSCode( slug );
	}
}

const launchVSCode = ( slug: string ) => {
	const workspacePath = getVSCodeWorkspacePath( slug );

	if ( existsSync( workspacePath ) ) {
		console.log( 'VS Code workspace already exists, skipping creation.' );
	} else {
		generateVSCodeWorkspace( slug );
		console.log( 'VS Code workspace generated' );
	}

	const vsCodeExecutable = getVSCodeExecutable();
	if ( vsCodeExecutable ) {
		spawn( vsCodeExecutable, [ workspacePath ], { shell: process.platform === 'win32' } );
	} else {
		console.log(
			`VS Code was not detected in the expected path. VS Code Workspace file location:\n${ workspacePath }`
		);
	}
};

const getVSCodeExecutable = () => {
	const candidates = [ 'code', 'code-insiders', 'codium' ];
	for ( const candidate of candidates ) {
		const result = which( candidate );
		if ( result ) {
			debug( `Found ${ candidate } in path` );
			return candidate;
		}
		debug( `Could not find ${ candidate } in path` );
	}
	return null;
};
