#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { appQuery, appQueryFragments } from 'lib/config/software';

command( {
	appContext: true,
	appQuery,
	appQueryFragments,
	envContext: true,
	format: true,
	wildcardCommand: true,
} ).argv( process.argv, async ( arg: string[], { env } ) => {
	const { softwareSettings } = env;

	if ( softwareSettings === null ) {
		// TODO throw user error
		console.log( chalk.yellow( 'Note:' ), 'Software settings are not supported for this environmnet.' );
		process.exit();
	}

	let choosenSettings = [];
	if ( arg.length > 0 ) {
		const component = arg[ 0 ];
		if ( ! softwareSettings[ component ] ) {
			// TODO throw user error
			console.log( chalk.yellow( 'Note:' ), `Software settings for ${ component } are not supported for this environmnet.` );
			process.exit();
		}
		choosenSettings = [ softwareSettings[ component ] ];
	} else {
		choosenSettings = [
			softwareSettings.wordpress,
			softwareSettings.php,
			softwareSettings.muplugins,
			softwareSettings.nodejs,
		];
	}

	const preFormated = choosenSettings
		.filter( softwareSetting => !! softwareSetting )
		.map( softwareSetting => {
			let version = softwareSetting.current.version;
			if ( softwareSetting.slug === 'wordpress' && ! softwareSetting.pinned ) {
				version += ' (managed updates)';
			}

			return {
				name: softwareSetting.name,
				slug: softwareSetting.slug,
				version,
			};
		} );

	return preFormated;
} );
