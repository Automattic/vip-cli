#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
import chalk from 'chalk';
import gql from 'graphql-tag';
import { stdout } from 'single-line-log';

/**
 * Internal dependencies
 */
import API from 'lib/api';
import app from 'lib/api/app';
import command from 'lib/cli/command';
import { formatEnvironment } from 'lib/cli/format';
import { trackEvent } from 'lib/tracker';

const appQuery = `id,name,environments{
	id,name,defaultDomain,branch,datacenter,syncProgress{
		status,sync,steps{name,status}
	}
}`;

command( {
	appContext: true,
	appQuery: appQuery,
	childEnvContext: true,
	requireConfirm: 'Are you sure you want to sync from production?'
} )
	.argv( process.argv, async ( arg, opts ) => {
		const api = await API();
		let syncing = false;

		await trackEvent( 'sync_command_execute' );

		try {
			await api
				.mutate( {
					// $FlowFixMe: gql template is not supported by flow
					mutation: gql`
						mutation SyncEnvironmentMutation($input: AppEnvironmentSyncInput){
							syncEnvironment(input: $input){
								environment{
									id
								}
							}
						}
					`,
					variables: {
						input: {
							id: opts.app.id,
							environmentId: opts.env.id
						}
					}
				} );
		} catch ( e ) {
			syncing = true;

			await trackEvent( 'sync_command_execute_error', {
				error: `Already syncing: ${ e.message }`,
			} );
		}

		const sprite = {
			i: 0,
			sprite: [ '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏' ],
			next() {
				this.i++;

				if ( this.i >= this.sprite.length ) {
					this.i = 0;
				}

				return {
					value: this.sprite[ this.i ],
					done: false,
				};
			},
		};

		const application = await app( opts.app.id, appQuery );
		let environment = application
			.environments
			.find( env => env.id === opts.env.id );

		if ( syncing ) {
			if ( environment.syncProgress.status === 'running' ) {
				console.log( chalk.yellow( 'Note:' ), 'A data sync is already running' );
			} else {
				console.log( chalk.yellow( 'Note:' ), 'Someone recently ran a data sync on this site' );
				console.log( chalk.yellow( 'Note:' ), 'Please wait a few minutes before trying again' );
			}
		}

		console.log();
		console.log( `  syncing: ${ chalk.yellow( opts.app.name ) }` );
		console.log( `     from: ${ formatEnvironment( 'production' ) }` );
		console.log( `       to: ${ formatEnvironment( opts.env.name ) }` );

		let i = 0;
		const progress = setInterval( async () => {
			if ( i++ % 10 === 0 ) {
				// Query the API 1/10 of the time (every 1s)
				// The rest of the iterations are just for moving the spinner
				api
					.query( {
						// $FlowFixMe: gql template is not supported by flow
						query: gql`query App( $id: Int, $sync: Int ) {
							app( id: $id ){
								id,name,environments{
									id,name,defaultDomain,branch,datacenter,syncProgress( sync: $sync ){
										status,sync,steps{name,status}
									}
								}
							}
						}`,
						fetchPolicy: 'network-only',
						variables: {
							id: opts.app.id,
							sync: environment.syncProgress.sync,
						}
					} )
					.then( res => res.data.app )
					.then( _app => {
						environment = _app
							.environments
							.find( env => env.id === opts.env.id );
					} );
			}

			const marks = {
				pending: '○',
				running: chalk.blueBright( sprite.next().value ),
				success: chalk.green( '✓' ),
				failed: chalk.red( '✕' ),
				unknown: chalk.yellow( '✕' ),
			};

			const out = [];
			const steps = environment.syncProgress.steps || [];

			out.push( '' );

			steps.forEach( step => {
				if ( step.status === 'pending' ) {
					out.push( chalk.dim( ` ${ marks[ step.status ] } ${ step.name }` ) );
				} else {
					out.push( ` ${ marks[ step.status ] } ${ step.name }` );
				}
			} );

			out.push( '' );

			switch ( environment.syncProgress.status ) {
				case 'running':
					out.push( `${ marks.running } Press ^C to hide progress. Data sync will continue in the background.` );
					break;

				case 'failed':
					await trackEvent( 'sync_command_error', {
						error: 'API returned `failed` status',
					} );

					out.push( `${ marks.failed } Data Sync is finished for ${ opts.app.name }` );
					out.push( '' );
					clearInterval( progress );
					break;

				case 'success':
				default:
					await trackEvent( 'sync_command_success' );

					out.push( `${ marks.success } Data Sync is finished for ${ opts.app.name }` );
					out.push( '' );
					clearInterval( progress );
					break;
			}

			stdout( out.join( '\n' ) );
		}, 100 );
	} );
