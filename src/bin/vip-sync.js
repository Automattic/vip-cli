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
			console.log();
			console.log( colors.yellow( 'Note:' ), 'A data sync is already running' );
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

		const application = await app( opts.app.id );
		let environment = application
			.environments
			.find( env => env.id === opts.env.id );

		let i = 0;
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

			const marks = {
				pending: '○',
				running: colors.blue( sprite.next().value ),
				success: colors.green( '✓' ),
				failed: colors.red( '✕' ),
				unknown: colors.yellow( '✕' ),
			};

			const out = [];
			const steps = environment.syncProgress.steps || [];

			out.push( '' );

			steps.forEach( step => {
				if ( step.status === 'pending' ) {
					out.push( colors.dim( ` ${ marks[ step.status ] } ${ step.name }` ) );
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
					out.push( `${ marks.failed } Data Sync is finished for https://vip-test.go-vip.co` );
					out.push( '' );
					clearInterval( progress );
					break;

				case 'success':
				default:
					out.push( `${ marks.success } Data Sync is finished for https://vip-test.go-vip.co` );
					out.push( '' );
					clearInterval( progress );
					break;
			}

			log( out.join( '\n' ) );
		}, 100 );
	} );
