#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';

command( {
	requiredArgs: 1,
	usage: 'vip config software <action>',
} )
	.command( 'get', 'Read current software settings' )
	.command( 'update', 'Update software settings' ).examples(
		[
			{
				usage: 'vip config software update <wordpress|php|nodejs|muplugins> <version>',
				description: 'Update <component> to <version>',
			},
		]
	)
	.argv( process.argv );
