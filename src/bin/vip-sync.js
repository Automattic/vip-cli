#!/usr/bin/env node

// ours
const args = require( '../lib/cli/command' );
const repo = require( '../lib/cli/repo' );

const options = args( { app: true, empty: true, force: true } )
	.argv( process.argv, async ( arg, opts ) => {
		if ( opts.app ) {
			console.log( opts.app );
		}
	} );
