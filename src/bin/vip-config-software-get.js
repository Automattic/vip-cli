#!/usr/bin/env node

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { trackEvent } from '../lib/tracker';
import command from '../lib/cli/command';
import { formatData } from '../lib/cli/format';
import { appQuery, appQueryFragments, formatSoftwareSettings } from '../lib/config/software';
import UserError from '../lib/user-error';

// Command examples
const examples = [
	{
		usage:
			'vip @mysite.develop config software get wordpress --include available_versions --format json',
		description:
			'Read current software settings for WordPress in JSON format including available versions',
	},
	{
		usage: 'vip @mysite.develop config software get',
		description: 'Read current software settings for all components',
	},
];

const VALID_INCLUDES = [ 'available_versions' ];

command( {
	appContext: true,
	appQuery,
	appQueryFragments,
	envContext: true,
	wildcardCommand: true,
	format: true,
	usage: 'vip @mysite.develop config software get <wordpress|php|nodejs|muplugins>',
} )
	.option(
		'include',
		`Extra information to be included. Valid values: ${ VALID_INCLUDES.join( ',' ) }`
	)
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const trackingInfo = {
			environment_id: opt.env?.id,
			args: JSON.stringify( arg ),
		};
		await trackEvent( 'config_software_get_execute', trackingInfo );

		let include = [];
		if ( opt.include ) {
			if ( Array.isArray( opt.include ) ) {
				include = opt.include;
			} else {
				include = [ opt.include ];
			}
			const invalidIncludes = include.filter(
				includeKey => ! VALID_INCLUDES.includes( includeKey )
			);
			if ( invalidIncludes.length > 0 ) {
				throw new UserError( `Invalid include value(s): ${ invalidIncludes.join( ',' ) }` );
			}
		}
		const { softwareSettings } = opt.env;

		if ( softwareSettings === null ) {
			throw new UserError( 'Software settings are not supported for this environment.' );
		}

		let chosenSettings = [];
		if ( arg.length > 0 ) {
			const component = arg[ 0 ];
			if ( ! softwareSettings[ component ] ) {
				throw new UserError(
					`Software settings for ${ component } are not supported for this environment.`
				);
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
			.map( softwareSetting => formatSoftwareSettings( softwareSetting, include, opt.format ) );

		console.log( formatData( preFormatted, opt.format ) );

		await trackEvent( 'config_software_get_success', trackingInfo );
	} );
