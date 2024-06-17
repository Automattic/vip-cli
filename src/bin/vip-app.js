#!/usr/bin/env node

import chalk from 'chalk';

import app from '../lib/api/app';
import command, { getEnvIdentifier } from '../lib/cli/command';
import { trackEvent } from '../lib/tracker';

command( { requiredArgs: 1, format: true } )
	.example( 'vip app <app>', 'Pass an app name or ID to get details about that app' )
	.example( 'vip app 123', 'Get details about the app with ID 123' )
	.example( 'vip app vip-test', 'Get details about the app named vip-test' )
	.example(
		'vip app @mysite.develop deploy <file.zip>',
		'Deploy the given compressed file to your site'
	)
	.command( 'list', 'List your VIP applications' )
	.command( 'deploy', 'Deploy to your app from a file' )
	.argv( process.argv, async arg => {
		await trackEvent( 'app_command_execute' );

		let res;
		try {
			res = await app(
				arg[ 0 ],
				'id,repo,name,environments{id,appId,name,type,branch,currentCommit,primaryDomain{name},launched,deploymentStrategy}'
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

			// Set branch to empty for custom deployments
			if ( clonedEnv.deploymentStrategy === 'custom-deploy' ) {
				clonedEnv.branch = '-';
			}

			// Hide "deployment strategy" column
			delete clonedEnv.deploymentStrategy;

			return clonedEnv;
		} );

		return { header, data: clonedResponse.environments };
	} );
