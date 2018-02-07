#!/usr/bin/env node
// @flow

// ours
const args = require( '../lib/cli/command' );

args( { appContext: true, envContext: true, requireConfirm: true } )
	.argv( process.argv, async ( arg, opts ) => {
		if ( opts.app ) {
			console.log( opts.app );
		}
	} );
