#!/usr/bin/env node

const commander = require( 'commander' );
const promptly = require( 'promptly' );

// ours
const pkg = require( '../package.json' );
const Token = require( '../lib/token' );

const rootCmd = async function() {
	commander
		.version( pkg.version );

	let token = await Token.get();

	if ( token && token.valid() ) {
		commander
			.command( 'logout' )
			.action( async () => {
				await Token.purge();
			});

		commander.command( 'app', 'List and interact with VIP Go apps' );

		commander.parse( process.argv );

		// Show help if selected command is invalid
		const cmds = commander.commands.map( c => c._name );
		const subCmd = process.argv[2] || '';

		if ( ! process.argv.slice( 2 ).length || 0 > cmds.indexOf( subCmd ) ) {
			commander.help();
		}
	} else {
		commander.description( 'Run this command to login and get started' );
		commander.parse( process.argv );

		// TODO: oAuth flow instead of a prompt
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
		const bin = process.argv[1];
		const args = process.argv.slice( 2 );
		spawn( bin, args, { stdio: 'inherit' });
	}
};

rootCmd();
