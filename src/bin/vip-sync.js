#!/usr/bin/env node
// @flow

const colors = require( 'colors' );
const log = require( 'single-line-log' ).stdout;

// ours
const command = require( '../lib/cli/command' );
const { formatEnvironment } = require( '../lib/cli/format' );

command( { appContext: true, childEnvContext: true, requireConfirm: true } )
	.argv( process.argv, async ( arg, opts ) => {
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
		console.log( ` Syncing: ${ colors.yellow( opts.app.name ) }` );
		console.log( `    From: ${ formatEnvironment( 'production' ) }` );
		console.log( `      To: ${ formatEnvironment( opts.env.name ) }` );
		console.log();
		const progress = setInterval( () => {
			const marks = {
				pending: '○',
				running: colors.blue( sprite.next().value ),
				done: colors.green( '✓' ),
				error: colors.red( '✕' ),
			};

			const out = [
				` ${ marks.done } Prepare environment`,
				` ${ marks.running } Search-replace URLs`,
				colors.dim( ` ${ marks.pending } Restore environment` ),
				'',
			];

			const done = false;
			if ( done ) {
				clearInterval( progress );

				out.push( `${ marks.done } Data Sync is finished for https://vip-test.go-vip.co` );
			} else {
				out.push( `${ marks.running } Press ^C to hide progress. Data sync will continue in the background.` );
			}

			log( out.join( '\n' ) );
		}, 100 );
	} );
