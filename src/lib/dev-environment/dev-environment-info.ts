import chalk from 'chalk';
import debugLib from 'debug';

import { printTable } from './dev-environment-cli';
import { landoInfo } from './dev-environment-lando';
import {
	doesEnvironmentExist,
	getAllEnvironmentNames,
	getEnvironmentPath,
	readEnvironmentData,
} from './dev-environment-state';
import { DEV_ENVIRONMENT_NOT_FOUND } from '../constants/dev-environment';
import UserError from '../user-error';

import type { ComponentConfig, WordPressConfig } from './types';
import type Lando from 'lando';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

interface PrintOptions {
	extended?: boolean;
	suppressWarnings?: boolean;
}

export async function printAllEnvironmentsInfo(
	lando: Lando,
	options: PrintOptions
): Promise< void > {
	const allEnvNames = getAllEnvironmentNames();

	debug( 'Will print info for all environments. Names found: ', allEnvNames );

	console.log(
		'Found ' +
			chalk.bold( allEnvNames.length ) +
			' environments' +
			( allEnvNames.length ? ':' : '.' )
	);
	for ( const envName of allEnvNames ) {
		try {
			console.log( '\n' );
			// eslint-disable-next-line no-await-in-loop
			await printEnvironmentInfo( lando, envName, options );
		} catch ( error ) {
			if ( error instanceof UserError ) {
				console.warn( '\nWARNING: "%s" is not a valid environment\n', envName );
			} else {
				throw error;
			}
		}
	}
}

function parseComponentForInfo( component: ComponentConfig | WordPressConfig ): string {
	if ( component.mode === 'local' ) {
		return component.dir ?? '';
	}

	// Environments created by the old code will have `component.tag` set to `demo` instead of `undefined`.
	if ( component.tag === 'demo' || component.tag === 'latest' ) {
		component.tag = undefined;
	}

	return component.tag ?? '[demo-image]';
}

export async function printEnvironmentInfo(
	lando: Lando,
	slug: string,
	options: PrintOptions
): Promise< void > {
	debug( 'Will get info for an environment', slug );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const environmentExists = await doesEnvironmentExist( instancePath );
	if ( ! environmentExists ) {
		throw new UserError( DEV_ENVIRONMENT_NOT_FOUND );
	}

	const environmentData = readEnvironmentData( slug );
	const appInfo = await landoInfo( lando, instancePath, {
		suppressWarnings: Boolean( options.suppressWarnings ),
		autologinKey: environmentData.autologinKey,
	} );

	if ( options.extended ) {
		appInfo.title = environmentData.wpTitle;
		appInfo.multisite = Boolean( environmentData.multisite );
		appInfo.php = environmentData.php.split( ':' )[ 1 ];
		let xdebug = environmentData.xdebug ? 'enabled' : 'disabled';
		if ( environmentData.xdebug && environmentData.xdebugConfig ) {
			xdebug += ' (with additional configuration)';
		}
		appInfo.xdebug = xdebug;
		appInfo.cron = environmentData.cron ? 'enabled' : 'disabled';

		appInfo.wordpress = parseComponentForInfo( environmentData.wordpress );
		appInfo[ 'Mu plugins' ] = parseComponentForInfo( environmentData.muPlugins );
		appInfo[ 'App Code' ] = parseComponentForInfo( environmentData.appCode );
		if ( environmentData.mediaRedirectDomain ) {
			appInfo[ 'Media Redirect' ] = environmentData.mediaRedirectDomain;
		}
	}

	printTable( appInfo );
}
