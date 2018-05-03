#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import app from 'lib/api/app';

command( { requiredArgs: 1, format: true } )
	.example( 'vip app <app>', 'Pass an app name or ID to get details about that app' )
	.command( 'list', 'List your VIP Go apps' )
	.argv( process.argv, async ( arg, opts ) => {
		let res;

		try {
			res = await app( arg[ 0 ], 'id,environments{name,datacenter,branch,currentCommit,defaultDomain}' );
		} catch ( e ) {
			console.log( `App ${ chalk.blueBright( arg[ 0 ] ) } does not exist` );
			return;
		}

		if ( ! res || ! res.environments ) {
			console.log( `App ${ chalk.blueBright( arg[ 0 ] ) } does not exist` );
			return;
		}

		return res.environments;
	} );
