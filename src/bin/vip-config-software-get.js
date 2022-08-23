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
import { formatData } from 'lib/cli/format';
import { appQuery, appQueryFragments } from 'lib/config/software';
import UserError from '../lib/cli/userError';

// Command examples
const examples = [
	{
		usage: 'vip config software get wordpress --format json',
		description: 'Read current software settings for WordPress in JSON format',
	},
	{
		usage: 'vip config software get',
		description: 'Read current software settings for all components',
	},
];

command( {
	appContext: true,
	appQuery,
	appQueryFragments,
	envContext: true,
	wildcardCommand: true,
	format: true,
	usage: 'vip config software get <wordpress|php|nodejs|muplugins>',
} ).examples( examples ).argv( process.argv, async ( arg: string[], opt ) => {
	const { softwareSettings } = opt.env;

	if ( softwareSettings === null ) {
		throw new UserError( chalk.yellow( 'Note:' ), 'Software settings are not supported for this environment.' );
	}

	let chosenSettings = [];
	if ( arg.length > 0 ) {
		const component = arg[ 0 ];
		if ( ! softwareSettings[ component ] ) {
			throw new UserError( `Software settings for ${ component } are not supported for this environment.` );
		}
		chosenSettings = [ softwareSettings[ component ] ];
	} else {
		chosenSettings = [
			softwareSettings.wordpress,
			softwareSettings.php,
			softwareSettings.muplugins,
			softwareSettings.nodejs,
		];
	}

	const preFormatted = chosenSettings
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

	console.log( formatData( preFormatted, opt.format ) );
} );
