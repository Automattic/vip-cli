#!/usr/bin/env node

/**
 * The command line vip tool
 */

process.title = 'vip';

const program = require( 'commander' );
const tab = require( 'tabtab' )({ name: 'vip' });

// Ours
const packageJSON = require( '../../package.json' );
const utils = require( '../lib/utils' );
const api = require( '../lib/api' );

var is_vip = false;
var noAuth = [
	'login',
	'logout',
];

utils.getCredentials( ( err, user ) => {
	if ( err || ! user ) {
		if ( process.argv.length > 2 ) {
			if ( ! noAuth.indexOf( process.argv[2] ) ) {
				return program.executeSubCommand( process.argv.concat( 'login' ), [ 'login' ] );
			}
		}
	} else if ( user.role && 2 >= user.role ) {
		is_vip = true;
	}

	program
		.version( packageJSON.version )
		.command( 'login', 'Setup an access token to use with the CLI' )

	program
		.command( 'logout' )
		.description( 'Delete the stored access token' )
		.action( () => {
			utils.deleteCredentials();
		});

	// internal VIP commands
	if (!!is_vip) {
		program
			.command( 'api <method> <endpoint>', 'Authenticated API requests' )
			.command( 'cli <site> [command...]', 'Run a CLI command on agiven sandbox' )
			.command( 'db <site>', 'Connect to a given VIP Go database' )
			.command( 'deploy <site> <sha>', 'Deploy given git sha' )
			.command( 'import', 'Import to VIP Go' )
			.command( 'sandbox <action> <site>', 'Interacting with existing sandbox containers' )
			.command( 'stacks <action>', 'Maintain software stacks on the current host' )

		tab.on( 'deploy', ( data, done ) => {
			api
				.get( '/search' )
				.query( 'search', data.lastPartial )
				.end( ( end, res ) => {
					if ( err ) {
						return done( err );
					}

					var mapped, sites = [];

					// Add initial domain to suggestions list
					sites = res.body.data.map( s => {
						return s.domain_name;
					});

					// Add mapped domains to suggestions list
					for( let i = 0; i < res.body.data.length; i++ ) {
						mapped = res.body.data[i].mapped_domains.map( d => {
							return d.domain_name;
						});

						sites = sites.concat( mapped );
					}

					return done( null, sites );
				});
			});
	}

	// Tab complete top level commands!
	tab.on( 'vip', ( data, done ) => {
		var commands = program.commands.map( c => {
			if ( data.prev === c.parent.name() ) {
				return c.name();
			}
		});

		return done( null, commands );
	});

	tab.start();

	program.parse( process.argv );
	var cmds = program.commands.map(c => c._name);
	var subCmd = program.args.pop()._name || process.argv[2];

	if ( ! process.argv.slice( 2 ).length || 0 > cmds.indexOf(subCmd) ) {
		program.help();
	}
});
