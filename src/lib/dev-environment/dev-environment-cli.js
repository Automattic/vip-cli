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
import {
	DEV_ENVIRONMENT_FULL_COMMAND,
	DEV_ENVIRONMENT_SUBCOMMAND,
	DEV_ENVIRONMENT_DEFAULTS,
	DEV_ENVIRONMENT_PROMPT_INTRO,
	DEV_ENVIRONMENT_COMPONENTS,
} from '../constants/dev-environment';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

const DEFAULT_SLUG = 'vip-local';

export function handleCLIException( exception: Error ) {
	const errorPrefix = chalk.red( 'Error:' );
	if ( 'Environment not found.' === exception.message ) {
		const createCommand = chalk.bold( DEV_ENVIRONMENT_FULL_COMMAND + ' create' );

		const message = `Environment doesn't exist.\n\n\nTo create a new environment run:\n\n${ createCommand }\n`;
		console.log( errorPrefix, message );
	} else {
		let message = exception.message;
		// if the message has already ERROR prefix we should drop it as we are adding our own cool red Error-prefix
		message = message.replace( 'ERROR: ', '' );

		console.log( errorPrefix, message );
	}
}

type EnvironmentNameOptions = {
	slug: string,
	app: string,
	env: string,
}

export function getEnvironmentName( options: EnvironmentNameOptions ) {
	if ( options.slug ) {
		return options.slug;
	}

	if ( options.app ) {
		const envSuffix = options.env ? `-${ options.env }` : '';

		return options.app + envSuffix;
	}

	return DEFAULT_SLUG;
}

export function getEnvironmentStartCommand( options: EnvironmentNameOptions ) {
	if ( options.slug ) {
		return `${ DEV_ENVIRONMENT_FULL_COMMAND } start --slug ${ options.slug }`;
	}

	if ( options.app ) {
		let application = `@${ options.app }`;
		if ( options.env ) {
			application += `.${ options.env }`;
		}

		return `vip ${ application } ${ DEV_ENVIRONMENT_SUBCOMMAND } start`;
	}

	return `${ DEV_ENVIRONMENT_FULL_COMMAND } start`;
}

export function printTable( data: Object ) {
	const formattedData = formatters.formatData( data, { format: 'table' }, { border: false } );

	console.log( formattedData );
}

type ComponentConfig = {
	mode: 'local' | 'image' | 'inherit';
	dir?: string,
	image?: string,
	tag?: string,
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

type NewInstanceOptions = {
	title: string,
	multisite: boolean,
	php: string,
	wordpress: string,
	muPlugins: string,
	clientCode: string,
	elasticsearch: string,
	mariadb: string,
}

type AppInfo = {
	id: number,
	name: string,
	repository: string,
	environment: {
		name: string,
		type: string,
		branch: string,
		isMultisite: boolean,
		primaryDomain: string,
	}
}

export async function promptForArguments( providedOptions: NewInstanceOptions, appInfo: AppInfo ) {
	debug( 'Provided options', providedOptions );

	console.log( DEV_ENVIRONMENT_PROMPT_INTRO );

	const name = appInfo?.environment?.name || appInfo?.name;
	let multisiteText = 'Multisite';
	let multisiteDefault = DEV_ENVIRONMENT_DEFAULTS.multisite;

	if ( appInfo?.environment ) {
		const isEnvMultisite = !! appInfo?.environment?.isMultisite;
		multisiteText += ` (${ name } ${ isEnvMultisite ? 'IS' : 'is NOT' } multisite)`;
		multisiteDefault = isEnvMultisite;
	}

	const instanceData = {
		wpTitle: providedOptions.title || await promptForText( 'WordPress site title', name || DEV_ENVIRONMENT_DEFAULTS.title ),
		multisite: 'multisite' in providedOptions ? providedOptions.multisite : await promptForBoolean( multisiteText, multisiteDefault ),
		elasticsearch: providedOptions.elasticsearch || DEV_ENVIRONMENT_DEFAULTS.elasticsearchVersion,
		mariadb: providedOptions.mariadb || DEV_ENVIRONMENT_DEFAULTS.mariadbVersion,
		mediaRedirectDomain: '',
		wordpress: {},
		muPlugins: {},
		clientCode: {},
	};

	const primaryDomain = appInfo?.environment?.primaryDomain;
	if ( primaryDomain ) {
		const mediaRedirectPromptText = `Would you like to redirect to ${ primaryDomain } for missing media files?`;
		const setMediaRedirectDomain = await promptForBoolean( mediaRedirectPromptText, true );
		if ( setMediaRedirectDomain ) {
			instanceData.mediaRedirectDomain = primaryDomain;
		}
	}

	for ( const component of DEV_ENVIRONMENT_COMPONENTS ) {
		const option = providedOptions[ component ];

		instanceData[ component ] = await processComponent( component, option );
	}

	return instanceData;
}

async function processComponent( component: string, option: string ) {
	let result = null;

	const allowLocal = component !== 'wordpress';
	if ( option ) {
		result = processComponentOptionInput( option, allowLocal );
	} else {
		result = await promptForComponent( component, allowLocal );
	}

	while ( 'local' === result?.mode ) {
		const resolvedPath = resolvePath( result.dir || '' );
		result.dir = resolvedPath;

		const isDirectory = resolvedPath && fs.existsSync( resolvedPath ) && fs.lstatSync( resolvedPath ).isDirectory();
		const isEmpty = isDirectory ? fs.readdirSync( resolvedPath ).length === 0 : true;

		if ( isDirectory && ! isEmpty ) {
			break;
		} else {
			const message = `Provided path "${ resolvedPath }" does not point to a valid or existing directory.`;
			console.log( chalk.yellow( 'Warning:' ), message );
			result = await promptForComponent( component, allowLocal );
		}
	}

	return result;
}

export function resolvePath( input: string ): string {
	// Resolve does not do ~ reliably
	const resolvedPath = input.replace( /^~/, os.homedir() );
	// And resolve to handle relative paths
	return path.resolve( resolvedPath );
}

export async function promptForText( message: string, initial: string ) {
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

	return result.input.trim();
}

export async function promptForBoolean( message: string, initial: boolean ) {
	const confirm = new Confirm( {
		message,
		initial,
	} );

	return confirm.run();
}

const componentDisplayNames = {
	wordpress: 'WordPress',
	muPlugins: 'vip-go-mu-plugins',
	clientCode: 'site-code',
};

export async function promptForComponent( component: string, allowLocal: boolean ): Promise<ComponentConfig> {
	debug( `Prompting for ${ component }` );
	const componentDisplayName = componentDisplayNames[ component ] || component;
	const choices = [];

	if ( allowLocal ) {
		choices.push( {
			message: `local folder - where you already have ${ componentDisplayName } code`,
			value: 'local',
		} );
	}
	choices.push( {
		message: 'image - that gets automatically fetched',
		value: 'image',
	} );

	let initialMode = 'image';
	if ( 'clientCode' === component ) {
		initialMode = 'local';
	}

	let modeResult = initialMode;
	const selectMode = choices.length > 1;
	if ( selectMode ) {
		const initialModeIndex = choices.findIndex( choice => choice.value === initialMode );
		const select = new Select( {
			message: `How would you like to source ${ componentDisplayName }`,
			choices,
			initial: initialModeIndex,
		} );

		modeResult = await select.run();
	}

	const messagePrefix = selectMode ? '\t' : `${ componentDisplayName } - `;
	if ( 'local' === modeResult ) {
		const directoryPath = await promptForText( `${ messagePrefix }What is a path to your local ${ componentDisplayName }`, '' );
		return {
			mode: modeResult,
			dir: directoryPath,
		};
	}
	if ( 'inherit' === modeResult ) {
		return {
			mode: modeResult,
		};
	}

	// image
	if ( component === 'wordpress' ) {
		const message = `${ messagePrefix }Which version would you like`;
		const selectTag = new Select( {
			message,
			choices: getWordpressImageTags(),
		} );
		const tag = await selectTag.run();
		return {
			mode: modeResult,
			tag,
		};
	}

	return {
		mode: modeResult,
	};
}

function getWordpressImageTags(): string[] {
	return [ '5.8.1', '5.8', '5.7.3', '5.7.2' ];
}
