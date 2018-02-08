#!/usr/bin/env node
// @flow

// ours
const args = require( '../lib/cli/command' );

args( { appContext: true, childEnvContext: true, requireConfirm: true } )
	.argv( process.argv, async ( arg, opts ) => {
		console.log( opts.app );
	} );
