#!/usr/bin/env node

import chalk from 'chalk';

import app from '../lib/api/app';
import command, { getEnvIdentifier } from '../lib/cli/command';
import { trackEvent } from '../lib/tracker';

command( { requiredArgs: 1, format: true } )
	.example(
		'vip app list',
		'Retrieve a list of applications that can be accessed by the current authenticated VIP-CLI user.'
	)
	.example(
		'vip app example-app',
		'Retrieve information about the application named "example-app" and its environments.'
	)
	.example(
		'WPVIP_DEPLOY_TOKEN=1234 vip @example-app.develop app deploy file.zip',
		'Deploy a local archived file named "file.zip" that contains application code to a VIP Platform environment that has Custom Deployment enabled.'
	)
	.command(
		'list',
		'Retrieve a list of applications that can be accessed by the current authenticated VIP-CLI user.'
	)
	.command(
		'deploy',
		'Deploy an archived file of application code to an environment that has Custom Deployment enabled.'
	)
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
