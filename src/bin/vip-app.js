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
		await trackEvent( 'app_command_execute' );

		let res;
		try {
			res = await app(
				arg[ 0 ],
				'id,repo,name,environments{name,branch,currentCommit,primaryDomain{name}}'
			);
		} catch ( e ) {
			await trackEvent( 'app_command_fetch_error', {
				error: `App ${ arg[ 0 ] } does not exist`,
			} );

			console.log( `App ${ chalk.blueBright( arg[ 0 ] ) } does not exist` );
			return;
		}

		if ( ! res || ! res.environments ) {
			await trackEvent( 'app_command_fetch_error', {
				error: `App ${ arg[ 0 ] } does not exist`,
			} );

			console.log( `App ${ chalk.blueBright( arg[ 0 ] ) } does not exist` );
			return;
		}

		await trackEvent( 'app_command_success' );

		// Clone the read-only response object so we can modify it
		const r = Object.assign( {}, res );

		const header = [
			{ key: 'id', value: res.id },
			{ key: 'name', value: res.name },
			{ key: 'repo', value: res.repo },
		];

		r.environments = r.environments.map( env => {
			const e = Object.assign( {}, env );

			// Use the short version of git commit hash
			e.currentCommit = e.currentCommit.substring( 0, 7 );

			// Flatten object
			e.primaryDomain = e.primaryDomain.name;

			return e;
		} );

		return { header, data: r.environments };
	} );
