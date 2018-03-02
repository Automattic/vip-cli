#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
import colors from 'colors';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import app from 'lib/api/app';

command( { requiredArgs: 1, format: true } )
	.example( 'vip app <app>', 'Pass an app name or ID to get details about that app' )
	.command( 'list', 'List your VIP Go apps' )
	.argv( process.argv, async ( arg, opts ) => {
		const res = await app( arg[ 0 ], 'id,name,environments{id,name,defaultDomain}' );

		if ( ! res || ! res.environments ) {
			console.log( `App ${ colors.blue( arg[ 0 ] ) } does not exist` );
			return {};
		}

		return res.environments;
	} );
