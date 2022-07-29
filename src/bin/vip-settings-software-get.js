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
import { appQuery, appQueryFragments } from 'lib/settings/software';

command( {
	appContext: true,
	appQuery,
	appQueryFragments,
	envContext: true,
	format: true,
} ).argv( process.argv, async ( arg: string[], { env } ) => {
	const { softwareSettings } = env;

	if ( softwareSettings === null ) {
		console.log( chalk.yellow( 'Note:' ), 'Software settings are not supported for this environmnet.' );
		process.exit();
	}

	const preFormated = [
		softwareSettings.muplugins,
		softwareSettings.wordpress,
		softwareSettings.php,
		softwareSettings.nodejs,
	]
		.filter( softwareSetting => !! softwareSetting )
		.map( softwareSetting => ( {
			name: softwareSetting.name,
			current: softwareSetting.current.version,
			pinned: softwareSetting.pinned,
		} ) );

	return preFormated;
} );
