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

/**
 * Internal dependencies
 */
import {
	DEV_ENVIRONMENT_FULL_COMMAND,
	DEV_ENVIRONMENT_CONTAINER_IMAGES,
	DEV_ENVIRONMENT_DEFAULTS,
	DEV_ENVIRONMENT_PROMPT_INTRO,
	DOCKER_HUB_WP_IMAGES,
	DOCKER_HUB_JETPACK_IMAGES,
} from '../constants/dev-environment';
import fetch from 'node-fetch';

const DEFAULT_SLUG = 'vip-local';

export function handleCLIException( exception: Error ) {
	const errorPrefix = chalk.red( 'Error:' );
	if ( 'Environment not found.' === exception.message ) {
		const createCommand = chalk.bold( DEV_ENVIRONMENT_FULL_COMMAND + ' create' );

		const message = `Environment doesn't exist.\n\n\nTo create a new environment run:\n\n${ createCommand }\n`;
		console.log( errorPrefix, message );
	} else {
		console.log( errorPrefix, exception.message );
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

export function printTable( data: Object ) {
	const formattedData = formatters.formatData( data, { format: 'table' }, { border: false } );

	console.log( formattedData );
}

export function processComponentOptionInput( passedParam: string, type: string ) {
	// cast to string
	const param = passedParam + '';
	if ( param.includes( '/' ) ) {
		return {
			mode: 'local',
			dir: param,
		};
	}

	if ( type === 'jetpack' && param === 'mu' ) {
		return {
			mode: 'inherit',
		};
	}

	return {
		mode: 'image',
		image: DEV_ENVIRONMENT_CONTAINER_IMAGES[ type ].image,
		tag: param,
	};
}

type NewInstanceOptions = {
	title: string,
	multisite: boolean,
	phpVersion: string,
	wordpress: string,
	muPlugins: string,
	jetpack: string,
	clientCode: string
}

export async function promptForArguments( providedOptions: NewInstanceOptions ) {
	console.log( DEV_ENVIRONMENT_PROMPT_INTRO );

	const instanceData = {
		wpTitle: providedOptions.title || await promptForText( 'WordPress site title', DEV_ENVIRONMENT_DEFAULTS.title ),
		phpVersion: providedOptions.phpVersion || await promptForText( 'PHP version', DEV_ENVIRONMENT_DEFAULTS.phpVersion ),
		multisite: providedOptions.multisite || await promptForBoolean( 'Multisite', DEV_ENVIRONMENT_DEFAULTS.multisite ),
		wordpress: {},
		muPlugins: {},
		jetpack: {},
		clientCode: {},
	};

	const components = [ 'wordpress', 'muPlugins', 'jetpack', 'clientCode' ];
	for ( const component of components ) {
		const option = providedOptions[ component ];
		instanceData[ component ] = option
			? processComponentOptionInput( option, component )
			: await promptForComponent( component );
	}

	return instanceData;
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

export async function promptForComponent( component: string ) {
	const choices = [
		{
			message: `local folder - where you already have ${ component } code`,
			value: 'local',
		},
		{
			message: 'image - that gets automatically fetched',
			value: 'image',
		},
	];
	let initial = 1;
	if ( 'jetpack' === component ) {
		initial = 0;
		choices.unshift( {
			message: `inherit - use ${ component } included in mu-plugins`,
			value: 'inherit',
		} );
	} else if ( 'clientCode' === component ) {
		initial = 0;
	}

	const select = new Select( {
		message: `How would you like to source ${ component }`,
		choices,
		initial,
	} );

	const modeResult = await select.run();
	if ( 'local' === modeResult ) {
		const path = await promptForText( `	What is a path to your local ${ component }`, '' );
		return {
			mode: modeResult,
			dir: path,
		};
	}
	if ( 'inherit' === modeResult ) {
		return {
			mode: modeResult,
		};
	}

	// image
	let tag = DEV_ENVIRONMENT_CONTAINER_IMAGES[ component ].tag;
	const componentsWithPredefinedImageTag = [ 'muPlugins', 'clientCode' ];

	if ( ! componentsWithPredefinedImageTag.includes( component ) ) {
		const selectTag = new Select( {
			message: '	Which version would you like',
			choices: await getLatestImageTags( component ),
		} );
		tag = await selectTag.run();
	}

	return {
		mode: modeResult,
		image: DEV_ENVIRONMENT_CONTAINER_IMAGES[ component ].image,
		tag,
	};
}

async function getLatestImageTags( component: string ): string[] {
	const url = component === 'wordpress' ? DOCKER_HUB_WP_IMAGES : DOCKER_HUB_JETPACK_IMAGES;
	const request = await fetch( url );
	const body = await request.json();
	return body.results.map( x => x.name ).sort().reverse();
}
