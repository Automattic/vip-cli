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
import dns from 'dns';
import { spawn } from 'child_process';
import { which } from 'shelljs';

/**
 * Internal dependencies
 */
import { ProgressTracker } from '../../lib/cli/progress';
import { trackEvent } from '../tracker';

import {
	DEV_ENVIRONMENT_FULL_COMMAND,
	DEV_ENVIRONMENT_DEFAULTS,
	DEV_ENVIRONMENT_PROMPT_INTRO,
	DEV_ENVIRONMENT_COMPONENTS,
	DEV_ENVIRONMENT_NOT_FOUND,
	DEV_ENVIRONMENT_PHP_VERSIONS,
} from '../constants/dev-environment';
import {
	generateVSCodeWorkspace,
	getAllEnvironmentNames,
	getVSCodeWorkspacePath,
	getVersionList,
	readEnvironmentData,
} from './dev-environment-core';

import type {
	AppInfo,
	ComponentConfig,
	InstanceOptions,
	EnvironmentNameOptions,
	InstanceData,
	WordPressConfig,
	ConfigurationFileOptions,
} from './types';
import { validateDockerInstalled, validateDockerAccess } from './dev-environment-lando';
import UserError from '../user-error';
import typeof Command from '../../lib/cli/command';
import {
	CONFIGURATION_FILE_NAME,
	getConfigurationFileOptions,
} from './dev-environment-configuration-file';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

export const DEFAULT_SLUG = 'vip-local';

let isStdinTTY: boolean = Boolean( process.stdin.isTTY );

/**
 * Used internally for tests
 *
 * @param {boolean} val Value to set
 */
export function setIsTTY( val: boolean ): void {
	isStdinTTY = val;
}

const componentDisplayNames = {
	wordpress: 'WordPress',
	muPlugins: 'vip-go-mu-plugins',
	appCode: 'application code',
};

const componentDemoNames = {
	muPlugins: 'vip-go-mu-plugins',
	appCode: 'vip-go-skeleton',
};

// Forward declaration to avoid no-use-before-define
declare function promptForComponent(
	component: 'wordpress',
	allowLocal: false,
	defaultObject: ComponentConfig | null
): Promise< WordPressConfig >;
// eslint-disable-next-line no-redeclare
declare function promptForComponent(
	component: string,
	allowLocal: boolean,
	defaultObject: WordPressConfig | null
): Promise< ComponentConfig >;

export async function handleCLIException(
	exception: Error,
	trackKey?: string,
	trackBaseInfo: any = {}
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
			try {
				const errorTrackingInfo = { ...trackBaseInfo, failure: message, stack: exception.stack };
				await trackEvent( trackKey, errorTrackingInfo );
			} catch ( trackException ) {
				console.warn(
					errorPrefix,
					`Failed to record track event ${ trackKey }`,
					trackException.message
				);
			}
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

const verifyDNSResolution = async ( slug: string ): Promise< void > => {
	const expectedIP = '127.0.0.1';
	const testDomain = `${ slug }.vipdev.lndo.site`;
	const advice = `Please add following line to hosts file on your system:\n${ expectedIP } ${ testDomain }`;

	debug( `Verifying DNS resolution for ${ testDomain }` );
	let address;
	try {
		address = await dns.promises.lookup( testDomain, 4 );
		debug( `Got DNS response ${ address.address }` );
	} catch ( error ) {
		throw new UserError( `DNS resolution for ${ testDomain } failed. ${ advice }` );
	}

	if ( address.address !== expectedIP ) {
		throw new UserError(
			`DNS resolution for ${ testDomain } returned unexpected IP ${ address.address }. Expected value is ${ expectedIP }. ${ advice }`
		);
	}
};

const VALIDATION_STEPS = [
	{ id: 'docker', name: 'Check for Docker installation' },
	{ id: 'compose', name: 'Check for docker-compose installation' },
	{ id: 'access', name: 'Check Docker connectivity' },
	{ id: 'dns', name: 'Check DNS resolution' },
];

export const validateDependencies = async ( lando: Lando, slug: string, quiet?: boolean ) => {
	const now = new Date();
	const steps = slug ? VALIDATION_STEPS : VALIDATION_STEPS.filter( step => step.id !== 'dns' );
	const progressTracker = new ProgressTracker( steps );
	if ( ! quiet ) {
		console.log( 'Running validation steps...' );
		progressTracker.startPrinting();
		progressTracker.stepRunning( 'docker' );
	}

	try {
		validateDockerInstalled( lando );
	} catch ( exception ) {
		throw new UserError( exception.message );
	}

	if ( ! quiet ) {
		progressTracker.stepSuccess( 'docker' );
		progressTracker.stepSuccess( 'compose' );
		progressTracker.print();
	}

	try {
		await validateDockerAccess( lando );
	} catch ( exception ) {
		throw new UserError( exception.message );
	}

	if ( ! quiet ) {
		progressTracker.stepSuccess( 'access' );
		progressTracker.print();
	}

	if ( slug ) {
		await verifyDNSResolution( slug );
		if ( ! quiet ) {
			progressTracker.stepSuccess( 'dns' );
			progressTracker.print();
		}
	}

	if ( ! quiet ) {
		progressTracker.stopPrinting();
	}

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

	if ( configurationFileOptions.slug ) {
		const slug = configurationFileOptions.slug;
		console.log(
			`Using environment ${ chalk.blue.bold( slug ) } from ${ chalk.gray(
				CONFIGURATION_FILE_NAME
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

export function printTable( data: Object ) {
	const formattedData = formatters.formatData( data, { format: 'table' }, { border: false } );

	console.log( formattedData );
}

export function processComponentOptionInput(
	passedParam: string,
	allowLocal: boolean
): ComponentConfig {
	// cast to string
	const param = passedParam + '';
	// This is a bit of a naive check
	if ( allowLocal && /[\\/]/.test( param ) ) {
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
		php: appInfo.environment?.php || '',
		wordpress: appInfo.environment?.wordpress || '',
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
	suppressPrompts: boolean = false
): Promise< InstanceData > {
	debug( 'Provided preselected', preselectedOptions, 'and default', defaultOptions );

	if ( suppressPrompts ) {
		preselectedOptions = { ...(defaultOptions: Object), ...(preselectedOptions: Object) };
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
			preselectedOptions.title ||
			( await promptForText(
				'WordPress site title',
				defaultOptions.title || DEV_ENVIRONMENT_DEFAULTS.title
			) ),
		multisite: resolveMultisite(
			preselectedOptions.multisite ??
				( await promptForMultisite(
					multisiteText,
					defaultOptions.multisite || DEV_ENVIRONMENT_DEFAULTS.multisite
				) )
		),
		elasticsearch: false,
		php: preselectedOptions.php
			? resolvePhpVersion( preselectedOptions.php )
			: await promptForPhpVersion(
					resolvePhpVersion( defaultOptions.php || DEV_ENVIRONMENT_DEFAULTS.phpVersion )
			  ),
		mariadb: preselectedOptions.mariadb || defaultOptions.mariadb,
		mediaRedirectDomain: preselectedOptions.mediaRedirectDomain || '',
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
	};

	const promptLabels = {
		xdebug: 'XDebug',
		phpmyadmin: 'phpMyAdmin',
		mailpit: 'Mailpit',
		photon: 'Photon',
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

		// eslint-disable-next-line no-await-in-loop
		const result = await processComponent( component, option, defaultValue, suppressPrompts );
		if ( null === result ) {
			throw new Error( 'processComponent() returned null' );
		}

		instanceData[ component ] = result;
	}

	debug( `Processing elasticsearch with preselected "${ preselectedOptions.elasticsearch }"` );
	if ( 'elasticsearch' in preselectedOptions ) {
		instanceData.elasticsearch = !! preselectedOptions.elasticsearch;
	} else {
		instanceData.elasticsearch = await promptForBoolean(
			'Enable Elasticsearch (needed by Enterprise Search)?',
			!! defaultOptions.elasticsearch
		);
	}

	for ( const service of [ 'phpmyadmin', 'xdebug', 'mailpit', 'photon' ] ) {
		if ( service in instanceData ) {
			if ( service in preselectedOptions ) {
				instanceData[ service ] = preselectedOptions[ service ];
			} else {
				// eslint-disable-next-line no-await-in-loop
				instanceData[ service ] = await promptForBoolean(
					`Enable ${ promptLabels[ service ] || service }`,
					((defaultOptions[ service ]: any): boolean)
				);
			}
		}
	}

	debug( 'Instance data after prompts', instanceData );
	return instanceData;
}

async function processComponent(
	component: string,
	preselectedValue: string,
	defaultValue: string,
	suppressPrompts: boolean = false
) {
	debug(
		`processing a component '${ component }', with preselected/default - ${ preselectedValue }/${ defaultValue }`
	);
	let result = null;

	const allowLocal = component !== 'wordpress';
	const defaultObject = defaultValue
		? processComponentOptionInput( defaultValue, allowLocal )
		: null;
	if ( preselectedValue ) {
		result = processComponentOptionInput( preselectedValue, allowLocal );

		if ( allowLocal && suppressPrompts === false ) {
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

	while ( 'local' === result?.mode ) {
		const resolvedPath = resolvePath( result.dir || '' );
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
			if ( ! fs.existsSync( filePath ) ) {
				missingFiles.push( file );
			}
		}
		if ( missingFiles.length > 0 ) {
			// eslint-disable-next-line max-len
			const message = `Provided path "${ providedPath }" is missing following files/folders: ${ missingFiles.join(
				', '
			) }. Learn more: https://docs.wpvip.com/technical-references/vip-codebase/#1-wordpress`;
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
		directoryPath && fs.existsSync( directoryPath ) && fs.lstatSync( directoryPath ).isDirectory();
	const isEmpty = isDirectory ? fs.readdirSync( directoryPath ).length === 0 : true;

	return ! isEmpty && isDirectory;
}

export function resolvePath( input: string ): string {
	// Resolve does not do ~ reliably
	const resolvedPath = input.replace( /^~/, os.homedir() );
	// And resolve to handle relative paths
	return path.resolve( resolvedPath );
}

export async function promptForText( message: string, initial: string ): Promise< string > {
	let result = { input: initial };
	if ( isStdinTTY ) {
		const nonEmptyValidator = ( value: ?string ) => {
			if ( ( value || '' ).trim() ) {
				return true;
			}
			return 'value needs to be provided';
		};

		result = await prompt( {
			type: 'input',
			name: 'input',
			message,
			initial,
			validate: nonEmptyValidator,
		} );
	}

	return ( result?.input || '' ).trim();
}

export async function promptForMultisite(
	message: string,
	initial: string | boolean
): Promise< string | boolean > {
	let result = { input: initial };

	if ( isStdinTTY ) {
		result = await prompt( {
			type: 'input',
			name: 'input',
			message,
			initial,
		} );
	}

	let input = ( result?.input || initial.toString() ).trim();
	const multisiteOptions = [ 'subdomain', 'subdirectory' ];
	const allowedOptions = [ ...FALSE_OPTIONS, ...TRUE_OPTIONS, ...multisiteOptions, 'none' ];

	if ( ! allowedOptions.includes( input ) && isStdinTTY ) {
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
			initial,
		} );

		return confirm.run();
	}

	return Promise.resolve( initial );
}

function resolveMultisite( value: string | boolean ): string | boolean {
	const allowedValues = [ 'subdomain', 'subdirectory' ];
	if ( typeof value === 'string' && ! allowedValues.includes( value ) ) {
		return DEV_ENVIRONMENT_DEFAULTS.multisite;
	}

	return value;
}

export function resolvePhpVersion( version: string ): string {
	debug( `Resolving PHP version %j`, version );

	if ( version.startsWith( 'image:' ) ) {
		return version;
	}

	let result: string;
	if ( DEV_ENVIRONMENT_PHP_VERSIONS[ version ] === undefined ) {
		const images: string[] = Object.values( DEV_ENVIRONMENT_PHP_VERSIONS );
		const image = images.find( value => value === version );
		if ( image ) {
			result = image;
		} else if ( version.indexOf( '/' ) !== -1 ) {
			// Assuming this is a Docker image
			// This can happen when we first called `vip dev-env update -P image:ghcr.io/...`
			// and then called `vip dev-env update` again. The custom image won't match our images
			// but we still want to use it.
			result = version;
		} else {
			result = images[ 0 ];
		}
	} else {
		result = DEV_ENVIRONMENT_PHP_VERSIONS[ version ];
	}

	debug( 'Resolved PHP image: %j', result );
	return result;
}

export async function promptForPhpVersion( initialValue: string ): Promise< string > {
	debug( `Prompting for PHP version, preselected option is ${ initialValue }` );

	let answer = initialValue;
	if ( isStdinTTY ) {
		const choices = Object.keys( DEV_ENVIRONMENT_PHP_VERSIONS );
		const images = Object.values( DEV_ENVIRONMENT_PHP_VERSIONS );
		let initial = images.findIndex( version => version === initialValue );
		if ( initial === -1 ) {
			choices.push( initialValue );
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

// eslint-disable-next-line no-redeclare
export async function promptForComponent(
	component: string,
	allowLocal: boolean,
	defaultObject: ComponentConfig | null
): Promise< ComponentConfig | WordPressConfig > {
	debug( `Prompting for ${ component } with default:`, defaultObject );
	const componentDisplayName = componentDisplayNames[ component ] || component;
	const componentDemoName = componentDemoNames[ component ] || component;
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

	let initialMode = 'image';
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

		modeResult = await select.run();
	}

	debug( modeResult );

	const messagePrefix = selectMode ? '\t' : `${ componentDisplayName } - `;
	if ( 'local' === modeResult ) {
		const directoryPath = await promptForText(
			`${ messagePrefix }What is a path to your local ${ componentDisplayName }`,
			defaultObject?.dir || ''
		);
		return {
			mode: modeResult,
			dir: directoryPath,
		};
	}

	// image with selection
	if ( component === 'wordpress' ) {
		const tagChoices = await getTagChoices();
		let option = defaultObject?.tag || tagChoices[ 0 ].value;
		if ( isStdinTTY ) {
			const message = `${ messagePrefix }Which version would you like`;
			const selectTag = new Select( {
				message,
				choices: tagChoices,
				initial: option,
			} );

			option = await selectTag.run();
		}

		return ({
			mode: 'image',
			tag: option,
		}: WordPressConfig);
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

	return ! FALSE_OPTIONS.includes( value.toLowerCase?.() );
}

const TRUE_OPTIONS = [ 'true', 'yes', 'y', '1' ];
export function processStringOrBooleanOption( value: string | boolean ): string | boolean {
	if ( ! value || FALSE_OPTIONS.includes( value.toLowerCase?.() ) ) {
		return false;
	}

	if ( TRUE_OPTIONS.includes( value.toLowerCase?.() ) ) {
		return true;
	}

	return value;
}

export function processVersionOption( value: string ): string {
	if ( ! isNaN( value ) && value % 1 === 0 ) {
		// If it's an Integer passed in, let's ensure that it has a decimal in it to match the version tags e.g. 6 => 6.0
		return parseFloat( value ).toFixed( 1 );
	}

	return value + '';
}

export function addDevEnvConfigurationOptions( command: Command ): any {
	// We leave the third parameter to undefined on some because the defaults are handled in preProcessInstanceData()
	return command
		.option( 'wordpress', 'Use a specific WordPress version', undefined, processVersionOption )
		.option( [ 'u', 'mu-plugins' ], 'Use a specific mu-plugins changeset or local directory' )
		.option(
			'app-code',
			'Use the application code from a local directory or use "demo" for VIP skeleton code'
		)
		.option(
			'phpmyadmin',
			'Enable PHPMyAdmin component. By default it is disabled',
			undefined,
			processBooleanOption
		)
		.option( 'xdebug', 'Enable XDebug. By default it is disabled', undefined, processBooleanOption )
		.option(
			'xdebug_config',
			'Extra configuration to pass to xdebug via XDEBUG_CONFIG environment variable'
		)
		.option(
			'elasticsearch',
			'Enable Elasticsearch (needed by Enterprise Search)',
			undefined,
			processBooleanOption
		)
		.option(
			[ 'r', 'media-redirect-domain' ],
			'Domain to redirect for missing media files. This can be used to still have images without the need to import them locally.'
		)
		.option( 'php', 'Explicitly choose PHP version to use', undefined, processVersionOption )
		.option(
			[ 'G', 'mailhog' ],
			'Enable Mailpit. By default it is disabled (deprecated option, please use --mailpit instead)',
			undefined,
			processBooleanOption
		)
		.option(
			[ 'A', 'mailpit' ],
			'Enable Mailpit. By default it is disabled',
			undefined,
			processBooleanOption
		)
		.option(
			[ 'H', 'photon' ],
			'Enable Photon. By default it is disabled',
			undefined,
			processBooleanOption
		);
}

/**
 * Provides the list of tag choices for selection
 */
export async function getTagChoices(): Promise<
	{ name: string, message: string, value: string }[]
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

export function getEnvTrackingInfo( slug: string ): any {
	try {
		const envData = readEnvironmentData( slug );
		const result: { [string]: string } = { slug };
		for ( const key of Object.keys( envData ) ) {
			// track doesnt like camelCase
			const snakeCasedKey = key.replace( /[A-Z]/g, letter => `_${ letter.toLowerCase() }` );
			const value = ((( DEV_ENVIRONMENT_COMPONENTS.includes( key )
				? JSON.stringify( envData[ key ] )
				: envData[ key ] ): any): string);

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

export interface PostStartOptions {
	openVSCode: boolean;
}

export async function postStart( slug: string, options: PostStartOptions ) {
	if ( options.openVSCode ) {
		launchVSCode( slug );
	}
}

const launchVSCode = ( slug: string ) => {
	const workspacePath = getVSCodeWorkspacePath( slug );

	if ( fs.existsSync( workspacePath ) ) {
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

export function handleDeprecatedOptions( opts: any ): void {
	if ( opts.mailhog ) {
		console.warn(
			chalk.yellow(
				'Warning: --mailhog is deprecated and will be removed in a future release. Please use --mailpit instead.'
			)
		);
		if ( opts.mailpit === undefined ) {
			opts.mailpit = opts.mailhog;
		}

		delete opts.mailhog;
	}
}
