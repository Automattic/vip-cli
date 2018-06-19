#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import app from 'lib/api/app';
import { trackEvent } from 'lib/tracker';

command( { requiredArgs: 1, format: true } )
	.example( 'vip app <app>', 'Pass an app name or ID to get details about that app' )
	.example( 'vip app 123', 'Get details about the app with ID 123' )
	.example( 'vip app vip-test', 'Get details about the app named vip-test' )
	.command( 'list', 'List your VIP Go apps' )
	.argv( process.argv, async ( arg, opts ) => {
		trackEvent( 'app_command_execute' );

		let res;
		try {
			res = await app(
				arg[ 0 ],
				'id,environments{name,repo,branch,currentCommit,defaultDomain}'
			);
		} catch ( e ) {
			trackEvent( 'app_command_fetch_error', {
				error: `App ${ arg[ 0 ] } does not exist`,
			} );

			console.log( `App ${ chalk.blueBright( arg[ 0 ] ) } does not exist` );
			return;
		}

		if ( ! res || ! res.environments ) {
			trackEvent( 'app_command_fetch_error', {
				error: `App ${ arg[ 0 ] } does not exist`,
			} );

			console.log( `App ${ chalk.blueBright( arg[ 0 ] ) } does not exist` );
			return;
		}

		trackEvent( 'app_command_success' );

		return res.environments;
	} );
