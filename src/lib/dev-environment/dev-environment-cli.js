/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import chalk from 'chalk';
import formatters from 'lando/lib/formatters';

/**
 * Internal dependencies
 */
import { DEV_ENVIRONMENT_FULL_COMMAND, DEV_ENVIRONMENT_CONTAINER_IMAGES, DEV_ENVIRONMENT_DEFAULTS } from '../constants/dev-environment';

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
type NewInstanceOptions = {
	title: string,
	multisite: boolean,
	phpVersion: string,
	wordpress: string,
	muPlugins: string,
	jetpack: string,
	clientCode: string
}

export function generateInstanceData( slug: string, options: NewInstanceOptions ) {
	const instanceData = {
		siteSlug: slug,
		wpTitle: options.title || DEV_ENVIRONMENT_DEFAULTS.title,
		multisite: options.multisite || DEV_ENVIRONMENT_DEFAULTS.multisite,
		phpVersion: options.phpVersion || DEV_ENVIRONMENT_DEFAULTS.phpVersion,
		wordpress: getParamInstanceData( options.wordpress, 'wordpress' ),
		muPlugins: getParamInstanceData( options.muPlugins, 'muPlugins' ),
		jetpack: getParamInstanceData( options.jetpack, 'jetpack' ),
		clientCode: getParamInstanceData( options.clientCode, 'clientCode' ),
	};

	return instanceData;
}

export function getParamInstanceData( passedParam: string, type: string ) {
	if ( passedParam ) {
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

	return DEV_ENVIRONMENT_DEFAULTS[ type ];
}
