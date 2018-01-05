#!/usr/bin/env node

const commander = require( 'commander' );
const promptly = require( 'promptly' );

// ours
const pkg = require( '../package.json' );
const Token = require( '../lib/token' );

const rootCmd = async function() {
	commander
		.version( pkg.version );

	let token = await Token.getToken();

	if ( token && token.valid() ) {
		commander
			.command( 'logout' )
			.action( async () => {
				await Token.purgeTokens();
			});

		commander.parse( process.argv );

		// Show help if selected command is invalid
		const cmds = commander.commands.map( c => c._name );
		const subCmd = commander.args.length > 0 ? commander.args.pop()._name : process.argv[2];

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

		Token.setToken( t );
	}
};

rootCmd();
