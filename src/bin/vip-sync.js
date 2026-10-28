#!/usr/bin/env node

import { CombinedGraphQLErrors } from '@apollo/client/core';
import { stdout } from '@wwa/single-line-log';
import chalk from 'chalk';
import gql from 'graphql-tag';

import API from '../lib/api';
import app from '../lib/api/app';
import command from '../lib/cli/command';
import { formatEnvironment } from '../lib/cli/format';
import { trackEvent } from '../lib/tracker';

// The API reports the current step as the overall status while a sync is in progress.
const SYNC_RUNNING_STATUSES = [ 'running', 'started', 'importing', 'cleanup' ];
const SYNC_SUCCESS_STATUSES = [ 'success', 'complete' ];

const appQuery = `id,name,environments{
	id,appId,type,name,defaultDomain,branch,datacenter,syncProgress{
		status,error,progress_update_text,sync,steps{name,status}
	},syncPreview { canSync, errors { message }, backup { createdAt }, replacements { from, to } }
}`;

command( {
	appContext: true,
	appQuery,
	childEnvContext: true,
	module: 'sync',
	requireConfirm: 'Are you sure you want to sync from production?',
} )
	.example(
		'vip @example-app.develop sync',
		'Sync the production environment database of the "example-app" application to the develop environment.'
	)
	.argv( process.argv, async ( arg, opts ) => {
		const api = API();
		let syncing = false;

		await trackEvent( 'sync_command_execute' );

		try {
			await api.mutate( {
				mutation: gql`
					mutation SyncEnvironmentMutation($input: AppEnvironmentSyncInput) {
						syncEnvironment(input: $input) {
							environment {
								id
							}
						}
					}
				`,
				variables: {
					input: {
						id: opts.app.id,
						environmentId: opts.env.id,
					},
				},
			} );
		} catch ( error ) {
			if ( CombinedGraphQLErrors.is( error ) ) {
				let bail = false;

				for ( const err of error.errors ) {
					if ( err.message !== 'Site is already syncing' ) {
						bail = true;
						console.log( chalk.red( 'Error:' ), err.message );
					}
				}

				// TODO: Log e

				if ( bail ) {
					return;
				}
			}

			syncing = true;
			await trackEvent( 'sync_command_execute_error', {
				error: `Already syncing: ${ error.message }`,
			} );
		}

		const sprite = {
			count: 0,
			sprite: [ '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏' ],
			next() {
				this.count++;

				if ( this.count >= this.sprite.length ) {
					this.count = 0;
				}

				return {
					value: this.sprite[ this.count ],
					done: false,
				};
			},
		};

		const application = await app( opts.app.id, appQuery );
		let environment = application.environments.find( env => env.id === opts.env.id );

		if ( syncing ) {
			if ( SYNC_RUNNING_STATUSES.includes( environment.syncProgress.status ) ) {
				console.log( chalk.yellow( 'Note:' ), 'A data sync is already running.' );
			} else {
				console.log( chalk.yellow( 'Note:' ), 'Someone recently ran a data sync on this site.' );
				console.log( chalk.yellow( 'Note:' ), 'Please wait a few minutes before trying again.' );
			}
		}

		console.log();
		console.log( `  syncing: ${ chalk.yellow( opts.app.name ) }` );
		console.log( `     from: ${ formatEnvironment( 'production' ) }` );
		console.log( `       to: ${ formatEnvironment( opts.env.type ) }` );

		let count = 0;
		const progress = setInterval( async () => {
			if ( count++ % 10 === 0 ) {
				// Query the API 1/10 of the time (every 1s)
				// The rest of the iterations are just for moving the spinner
				api
					.query( {
						query: gql`
							query App($id: Int) {
								app(id: $id) {
									id
									name
									environments {
										id
										name
										defaultDomain
										branch
										datacenter
										syncProgress {
											status
											error
											progress_update_text
											sync
											steps {
												name
												status
											}
										}
									}
								}
							}
						`,
						fetchPolicy: 'network-only',
						variables: {
							id: opts.app.id,
						},
					} )
					.then( res => res.data.app )
					.then( _app => {
						environment = _app.environments.find( env => env.id === opts.env.id );
					} );
			}

			const marks = {
				pending: '○',
				running: chalk.blueBright( sprite.next().value ),
				success: chalk.green( '✓' ),
				finished: chalk.green( '✓' ),
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
					out.push( ` ${ marks[ step.status ] ?? marks.unknown } ${ step.name }` );
				}
			} );

			out.push( '' );

			const {
				status,
				error: syncError,
				progress_update_text: progressText,
			} = environment.syncProgress;

			if ( progressText ) {
				out.push( ` ${ progressText }` );
				out.push( '' );
			}

			if ( status === 'failed' ) {
				clearInterval( progress );

				await trackEvent( 'sync_command_error', {
					error: 'API returned `failed` status',
				} );

				out.push( `${ marks.failed } Data Sync failed for ${ opts.app.name }.` );
				if ( syncError ) {
					out.push( `${ chalk.red( 'Error:' ) } ${ syncError }` );
				}
				out.push( '' );
			} else if ( status === 'partially_completed' ) {
				clearInterval( progress );

				await trackEvent( 'sync_command_partially_completed' );

				out.push( `${ marks.unknown } Data Sync is partially completed for ${ opts.app.name }.` );
				if ( syncError ) {
					out.push( `${ chalk.yellow( 'Error:' ) } ${ syncError }` );
				}
				out.push( '' );
			} else if ( SYNC_SUCCESS_STATUSES.includes( status ) ) {
				clearInterval( progress );

				await trackEvent( 'sync_command_success' );

				out.push( `${ marks.success } Data Sync is finished for ${ opts.app.name }.` );
				out.push( '' );
			} else {
				// Running, or not_syncing until the job shows up: keep polling.
				out.push( 'Press ^C to hide progress. Data sync will continue in the background.' );
			}

			stdout( out.join( '\n' ) );
		}, 100 );
	} );
