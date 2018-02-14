#!/usr/bin/env node
// @flow
const colors = require( 'colors' );
const gql = require( 'graphql-tag' );
const log = require( 'single-line-log' ).stdout;

// ours
const API = require( '../lib/api' );
const app = require( '../lib/api/app' );
const command = require( '../lib/cli/command' );
const { formatEnvironment } = require( '../lib/cli/format' );

command( { appContext: true, childEnvContext: true, requireConfirm: true } )
	.argv( process.argv, async ( arg, opts ) => {
		const api = await API();

		try {
			await api
				.mutate( {
					// $FlowFixMe
					mutation: gql`
						mutation SyncEnvironmentMutation($input: AppEnvironmentSyncInput){
							syncEnvironment(input: $input){environment{id}}
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
			console.log( 'A data sync is already running' );
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

		console.log();
		console.log( `  syncing: ${ colors.yellow( opts.app.name ) }` );
		console.log( `     from: ${ formatEnvironment( 'production' ) }` );
		console.log( `       to: ${ formatEnvironment( opts.env.name ) }` );

		let environment, i = 0;
		const progress = setInterval( async () => {
			if ( i++ % 10 === 0 ) {
				// Query the API 1/10 of the time (every 1s)
				// The rest of the iterations are just for moving the spinner
				app( opts.app.id )
					.then( _app => {
						environment = _app
							.environments
							.find( env => env.id === opts.env.id );
					} );
			}

			let percentage = 0, status = '';
			if ( environment && environment.syncProgress ) {
				percentage = environment.syncProgress.percentage;
				status = environment.syncProgress.status;
			}

			const marks = {
				pending: '○',
				running: colors.blue( sprite.next().value ),
				done: colors.green( '✓' ),
				error: colors.red( '✕' ),
			};

			const out = [
				` progress: ${ percentage }% (${ status })`,
				'',
				` ${ marks.done } Prepare environment`,
				` ${ marks.running } Search-replace URLs`,
				colors.dim( ` ${ marks.pending } Restore environment` ),
				'',
			];

			let done = false;
			if ( environment ) {
				done = environment.syncProgress &&
					environment.syncProgress.status !== 'running';
			}

			if ( done ) {
				clearInterval( progress );

				out.push( `${ marks.done } Data Sync is finished for https://vip-test.go-vip.co` );
				out.push( '' );
			} else {
				out.push( `${ marks.running } Press ^C to hide progress. Data sync will continue in the background.` );
			}

			log( out.join( '\n' ) );
		}, 100 );
	} );
