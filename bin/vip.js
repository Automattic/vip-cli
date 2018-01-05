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

		commander.command( 'site', 'List and interact with VIP Go sites' );

		commander.parse( process.argv );

		// Show help if selected command is invalid
		const cmds = commander.commands.map( c => c._name );
		const subCmd = process.argv[2] || '';

		if ( ! process.argv.slice( 2 ).length || 0 > cmds.indexOf( subCmd ) ) {
			commander.help();
		}
	} else {
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
		}

		Token.set( t );
	}
};

rootCmd();
