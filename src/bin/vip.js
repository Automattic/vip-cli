#!/usr/bin/env node

const promptly = require( 'promptly' );

// ours
const args = require( '../lib/cli/command' );
const Token = require( '../lib/token' );

const rootCmd = async function() {
	let token = await Token.get();

	if ( token && token.valid() ) {
		args()
			.command( 'logout', 'Logout from your current session', () => Token.purge() )
			.command( 'app', 'List and modify your VIP Go apps' )
			.command( 'sync', 'Sync production to a development environment' )
			.argv( process.argv );
	} else {
		args( { empty: true } ).argv( process.argv );

		const t = await promptly.password( 'Access Token:' );

		try {
			token = new Token( t );
		} catch ( e ) {
			console.log( 'Invalid token: misformed' );
			return;
		}

		if ( token.expired() ) {
			console.log( 'Invalid token: expired' );
			return;
		}

		if ( ! token.valid() ) {
			console.log( 'Invalid token' );
			return;
		}

		Token.set( token.raw );

		// Exec the command we originally  wanted
		const spawn = require( 'child_process' ).spawn;
		const bin = process.argv[ 1 ];
		const argv = process.argv.slice( 2 );
		spawn( bin, argv, { stdio: 'inherit' } );
	}
};

rootCmd();
