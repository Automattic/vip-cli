#!/usr/bin/env node

/**
 * External dependencies
 */
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import command, { getEnvIdentifier } from '../lib/cli/command';
import app from '../lib/api/app';
import { trackEvent } from '../lib/tracker';

command( { requiredArgs: 1, format: true } )
	.example( 'vip app <app>', 'Pass an app name or ID to get details about that app' )
	.example( 'vip app 123', 'Get details about the app with ID 123' )
	.example( 'vip app vip-test', 'Get details about the app named vip-test' )
	.command( 'list', 'List your VIP applications' )
	.argv( process.argv, async arg => {
		await trackEvent( 'app_command_execute' );

		let res;
		try {
			res = await app(
				arg[ 0 ],
				'id,repo,name,environments{id,appId,name,type,branch,currentCommit,primaryDomain{name},launched}'
			);
		} catch ( err ) {
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
		const clonedResponse = Object.assign( {}, res );

		const header = [
			{ key: 'id', value: res.id },
			{ key: 'name', value: res.name },
			{ key: 'repo', value: res.repo },
		];

		clonedResponse.environments = clonedResponse.environments.map( env => {
			const clonedEnv = Object.assign( {}, env );

			clonedEnv.name = getEnvIdentifier( env );

			// Use the short version of git commit hash
			clonedEnv.currentCommit = clonedEnv.currentCommit.substring( 0, 7 );

			// Flatten object
			clonedEnv.primaryDomain = clonedEnv.primaryDomain.name;

			return clonedEnv;
		} );

		return { header, data: clonedResponse.environments };
	} );
