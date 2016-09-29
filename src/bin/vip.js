#! /usr/bin/env node

/**
 * The command line vip tool
 */

process.title = 'vip';

var program = require( 'commander' );
var promptly = require( 'promptly' );
var tab = require( 'tabtab' )({ name: 'vip' });
var which = require( 'which' );
const spawn = require('child_process').spawn;

// Ours
var packageJSON = require( '../../package.json' );
var utils = require( '../src/utils' );
var api = require( '../src/api' );
var db = require( '../src/db' );

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
		.command( 'login', 'setup an access token to use with the CLI' )

	program
		.command( 'logout' )
		.description( 'delete the stored access token' )
		.action( () => {
			utils.deleteCredentials();
		});

	// internal VIP commands
	if (!!is_vip) {
		program
			.command( 'api', 'Authenticated API requests' )
			.command( 'import', 'import to VIP Go' );

		program
			.command( 'cli <site> [command...]' )
			.description( 'Run a CLI command on a given sandbox' )
			.action( ( site, command, options ) => {
				utils.getSandboxForSite( site, ( err, sandbox ) => {
					if ( err ) {
						return console.error( err );
					}

					var run = [
						'exec',
						'-u', '1001',
						'-it', sandbox.container_name,
						'env', 'TERM=xterm',
					];

					if ( command.length < 1 ) {
						run.push( 'bash' );
					} else {
						run = run.concat( command );

						// TODO: Define this in wp-cli.yml
						if ( "wp" == command[0] ) {
							run.push( '--path=/var/www' );
						}
					}

					// TODO: Handle file references as arguments
					spawn( 'docker', run, { stdio: 'inherit' } );
				});
			});

		program
			.command( 'db <site>' )
			.option( '-e, --export', 'Export the given database to stdout' )
			.description( 'Connect to a given VIP Go database' )
			.action( ( site, options ) => {
				try {
					var mysql_exists = which.sync( 'mysql' );
				} catch (e) {
					return console.error( 'MySQL client is required and not installed.' );
				}

				utils.findSite( site, ( err, s ) => {
					if ( err ) {
						return console.error( err );
					}

					if ( ! s ) {
						return console.error( "Couldn't find site:", site );
					}

					if ( options.export ) {
						console.log( '-- Site:', s.client_site_id );
						console.log( '-- Domain:', s.domain_name );
						console.log( '-- Environment:', s.environment_name );
						return db.exportDB( s, err => {
							if ( err ) {
								return console.error( err );
							}
						});
					}

					var ays = s.environment_name == "production" ? 'This is the database for PRODUCTION. Are you sure?' : 'Are you sure?';
					console.log( "Client Site:", s.client_site_id );
					console.log( "Primary Domain:", s.domain_name );
					console.log( "Environment:", s.environment_name );
					promptly.confirm( ays, ( err, t ) => {
						if ( err ) {
							return console.error( err );
						}

						if ( ! t ) {
							return;
						}

						return db.getCLI( s, err => {
							if ( err ) {
								return console.error( err );
							}
						});
					});
				});
			});

	program
		.command( 'deploy <site> <sha>' )
		.description( 'deploy given git SHA')
		.action( (site, sha) => {
			// TODO: Make sha optional, deploy latest
			// TODO: Take domain name for site

			api
				.post('/sites/' + site + '/revisions/' + sha + '/deploy' )
				.end( err => {
					if (err) {
						console.error(err.response.error)
					}
				})
		})

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
