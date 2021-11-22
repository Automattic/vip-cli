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
import git from 'nodegit'
import path from 'path';
import os from 'os';
import xdgBasedir from 'xdg-basedir';

/**
 * Internal dependencies
 */
import { getRepoPath }  from './dev-environment-core';
import {
	DEV_ENVIRONMENT_FULL_COMMAND,
	DEV_ENVIRONMENT_SUBCOMMAND,
	DEV_ENVIRONMENT_DEFAULTS,
	DEV_ENVIRONMENT_PROMPT_INTRO,
	DEV_ENVIRONMENT_COMPONENTS,
	DEV_ENVIRONMENT_GIT_URL,
	DEV_ENVIRONMENT_WAIT_MESSAGE,
	DEV_ENVIRONMENT_MODE_IMAGE,
	DEV_ENVIRONMENT_MODE_LOCAL,
	DEV_ENVIRONMENT_MODE_INHERIT,
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
	mode: DEV_ENVIRONMENT_MODE_LOCAL | DEV_ENVIRONMENT_MODE_IMAGE | DEV_ENVIRONMENT_MODE_INHERIT;
	dir?: string,
	image?: string,
	tag?: string,
}

export function processComponentOptionInput( passedParam: string ): ComponentConfig {
	// cast to string
	const param = passedParam + '';
	if ( param.includes( '/' ) ) {
		return {
			mode: DEV_ENVIRONMENT_MODE_LOCAL,
			dir: param,
		};
	}

	return {
		mode: DEV_ENVIRONMENT_MODE_IMAGE,
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

	if ( option ) {
		result = processComponentOptionInput( option );
	} else {
		result = await promptForComponent( component );
	}

	while ( DEV_ENVIRONMENT_MODE_LOCAL === result?.mode ) {
		const resolvedPath = resolvePath( result.dir || '' );
		result.dir = resolvedPath;

		const isDirectory = resolvedPath && fs.existsSync( resolvedPath ) && fs.lstatSync( resolvedPath ).isDirectory();
		const isEmpty = isDirectory ? fs.readdirSync( resolvedPath ).length === 0 : true;

		if ( isDirectory && ! isEmpty ) {
			break;
		} else {
			const message = `Provided path "${ resolvedPath }" does not point to a valid or existing directory.`;
			console.log( chalk.yellow( 'Warning:' ), message );
			result = await promptForComponent( component );
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

export async function promptForComponent( component: string ): Promise<ComponentConfig> {
	debug( `Prompting for ${ component }` );
	const componentDisplayName = componentDisplayNames[ component ] || component;
	const choices = [];

	if ( component !== 'wordpress' ) {
		choices.push( {
			message: `local folder - where you already have ${ componentDisplayName } code`,
			value: DEV_ENVIRONMENT_MODE_LOCAL,
		} );
	}

	choices.push( {
		message: 'image - that gets automatically fetched',
		value: DEV_ENVIRONMENT_MODE_IMAGE,
	} );

	let initialMode = DEV_ENVIRONMENT_MODE_IMAGE;
	if ( 'clientCode' === component ) {
		initialMode = DEV_ENVIRONMENT_MODE_LOCAL;
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
	if ( DEV_ENVIRONMENT_MODE_LOCAL === modeResult ) {
		const directoryPath = await promptForText( `${ messagePrefix }What is a path to your local ${ componentDisplayName }`, '' );
		return {
			mode: modeResult,
			dir: directoryPath,
		};
	}
	if ( DEV_ENVIRONMENT_MODE_INHERIT === modeResult ) {
		return {
			mode: modeResult,
		};
	}

	// local dist
	if ( component === 'wordpress' ) {
		const message = `${ messagePrefix }Which version would you like`;
		const selectTag = new Select( {
			message,
			choices: await getWordpressTags(),
		} );
		const tag = await selectTag.run();
		return {
			mode: DEV_ENVIRONMENT_MODE_LOCAL,
			tag,
		};
	}

	return {
		mode: modeResult,
	};
}

async function cloneWordPressRepo() {
	await git.Clone.clone( DEV_ENVIRONMENT_GIT_URL, getRepoPath() );
}

async function getWordPressRepo(): git.Repository {
	const path = getRepoPath();
	let updated = false;

	console.log( DEV_ENVIRONMENT_WAIT_MESSAGE );

	if ( ! fs.existsSync( path ) || ! fs.lstatSync( path ).isDirectory() ) {
		updated = true;
		await cloneWordPressRepo();
	}

	const repo = await git.Repository.init( getRepoPath(), 0 );

	if ( ! updated ) {
		// TODO: stash/reset the working branch in case it's dirty

		await repo.fetchAll();
	}

	return repo;
}

async function getWordpressTags(): string[] {
	const repo = await getWordPressRepo();
	const tags = await git.Tag.list( repo );
	return collateTagList( tags );
}

/**
 *	Attempts to organize the list of tags in an intelligent way.
 *	Show all editions of the current major version
 *	Show only the the most recent point releases of previous major versions
 *	Limit the list to 20 by default
 */
function collateTagList( tags: string[], size: number = 20 ) {
	const majorVersions = [];
	const versions = {};
	const releases = {};
	const newTagList = [];
	let majorVersion, version, release;
	let parts = [];
	let sizeOffset = 0;

	// sort tags
	tags = tags.reverse();

	// index tags
	for ( const tag of tags ) {
		[ majorVersion, version, release ] = tag.split( '.' );

		// index majorVersion
		if ( majorVersions.indexOf( majorVersion ) < 0 ) {
			majorVersions.push( majorVersion );
		}

		// index version
		if ( ! versions.hasOwnProperty( majorVersion ) ) {
			versions[ majorVersion ] = [];
		}

		if ( versions[ majorVersion ].indexOf( `${ majorVersion }.${ version }` ) < 0 ) {
			versions[ majorVersion ].push( `${ majorVersion }.${ version }` );
		}

		// index release
		if ( ! releases.hasOwnProperty( `${ majorVersion }.${ version }` ) ) {
			releases[ `${ majorVersion }.${ version }` ] = [];
		}

		if ( releases[ `${ majorVersion }.${ version }` ].indexOf( tag ) < 0 ) {
			releases[ `${ majorVersion }.${ version }` ].push( tag );
		}

		if ( release != undefined ) {
			if ( releases[ `${ majorVersion }.${ version }` ].indexOf( tag ) < 0 ) {
				releases[ `${ majorVersion }.${ version }` ].push( tag );
			}
		}
	}

	// build new tag list from indexes
	newTags:
	for ( const i in majorVersions ) {
		for ( const [ j, v ] of versions[ majorVersions[ i ] ].entries() ) {
			// If it is the most recent version, append all of the releases
			if ( i == 0 && j == 0 ) {
				sizeOffset = releases[ v ].length;
				newTagList.push( ...releases[ v ] )
			} else {
				// append only the newest release for previous versions
				newTagList.push( releases[ v ][ 0 ] );
			}

			if ( newTagList.length >= ( size - sizeOffset) ) {
				break newTags;
			}
		}
	}

	return newTagList;
}
