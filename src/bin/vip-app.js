#!/usr/bin/env node
// @flow

const colors = require( 'colors' );

// ours
const args = require( '../lib/cli/command' );
const app = require( '../lib/api/app' );

args( { requiredArgs: 1, format: true } )
	.example( 'vip app <app>', 'Pass an app name or ID to get details about that app' )
	.command( 'list', 'List your VIP Go apps' )
	.argv( process.argv, async ( arg, opts ) => {
		const res = await app( arg[ 0 ] );

		if ( ! res || ! res.environments ) {
			console.log( `App ${ colors.blue( arg[ 0 ] ) } does not exist` );
			return {};
		}

		return res.environments;
	} );
