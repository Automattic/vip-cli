#!/usr/bin/env node
// @flow

const colors = require( 'colors' );
const log = require( 'single-line-log' ).stdout;

// ours
const args = require( '../lib/cli/command' );

args( { appContext: true, childEnvContext: true, requireConfirm: true } )
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

		setInterval( () => {
			const marks = {
				pending: colors.dim( '○' ),
				running: colors.blue( sprite.next().value ),
				done: colors.green( '✓' ),
				error: colors.red( '✕' ),
			};

			const out = [
				'',
				`Syncing: ${ colors.blue( opts.app.name ) } (${ colors.yellow( 'production' ) }) to ${ colors.blue( opts.env.defaultDomain ) } (${ colors.yellow( opts.env.name ) })`,
				'',
				`${ marks.done } Prepare environment`,
				`${ marks.running } Search-replace URLs`,
				`${ marks.pending } Restore environment`,
				'',
				'Press ^C to hide progress. Data sync will continue in the background.',
			];

			log( out.join( '\n' ) );
		}, 100 );
	} );
