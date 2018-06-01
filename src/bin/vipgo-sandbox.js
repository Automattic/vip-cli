#!/usr/bin/env node

const program = require( 'commander' );
const promptly = require( 'promptly' );
const async = require( 'async' );

// Ours
const api = require( '../lib/api' );
const sandbox = require( '../lib/sandbox' );
const utils = require( '../lib/utils' );

program
	.command( 'list' )
	.alias( 'ls' )
	.description( 'List existing sandboxes' )
	.action( () => {
		sandbox.listSandboxes();
	});

program
	.command( 'info <site>' )
	.description( 'Display connection information and other details about a sandbox container' )
	.action( ( site ) => {
		utils.findSite( site, ( err, s ) => {
			if ( err ) {
				return console.error( err );
			}

			if ( ! s ) {
				return console.error( `The requested site '${ site }' could not be found. Check the domain / ID and try again.` );
			}

			sandbox.getSandboxForSite( s, ( err, sbox ) => {
				if ( err ) {
					return console.error( `Failed to get sandbox container for ${ s.domain_name } (#${ s.client_site_id}): ${ err }` );
				}

				if ( ! sbox ) {
					return console.error( `There are no active sandbox containers for ${ s.domain_name } (#${ s.client_site_id }).` );
				}

				sandbox.displaySandboxNotice( sbox );
			});
		});
	});

program
	.command( 'run <site> <command...>' )
	.description( 'Run a wp-cli command on a sandbox container. Use a double dash (--) before the WP CLI command, example:' + "\n" + '  vip sandbox run exhibit.go-vip.co -- wp user list --field=ID' )
	.option( '--skip-confirm', 'Run the command without asking for confirmation' )
	.option( '-h, --help' )
	.allowUnknownOption()
	.action( ( site, command, options ) => {
		var confirm = ! options.skipConfirm;

		// Get a list of the "unknown" options from argv
		options = program.parseOptions( process.argv ).unknown;
		command = command.concat( options );

		utils.findSite( site, ( err, site ) => {
			if ( err ) {
				return console.error( err );
			}

			if ( ! site ) {
				return console.error( 'Specified site does not exist. Try the ID.' );
			}

			sandbox.getSandboxAndRun( site, command, { confirm: confirm });
		});
	});

program
	.command( 'start <site>' )
	.option( '-A', 'Enables forwarding of the authentication agent connection.  This can also be specified on a per-host basis in a configuration file.' )
	.option( '--verbose', 'Verbose mode' )
	.description( 'Start a sandbox and switch you to the container namespace' )
	.action( ( site, options ) => {
		utils.findSite( site, ( err, site ) => {
			if ( err ) {
				return console.error( err );
			}

			if ( ! site ) {
				return console.error( 'Specified site does not exist. Try the ID.' );
			}

			sandbox.getSandboxAndRun( site, null, { user: 'root', agentForward: options.A, verbose: options.verbose });
		});
	});

program
	.command( 'stop <site>' )
	.description( 'Stop existing sandbox' )
	.action( ( site, options ) => {
		utils.findSite( site, ( err, site ) => {
			if ( err ) {
				return console.error( err );
			}

			if ( ! site ) {
				return console.error( 'Specified site does not exist. Try the ID.' );
			}

			sandbox.getSandboxesForSite( site, ( err, sbox ) => {
				if ( err ) {
					return console.error( err );
				}

				if ( ! sbox ) {
					return console.error( 'Sandbox does not exist for requested site.' );
				}


				utils.maybeConfirm( 'This will stop all containers for site '  + sbox[0].client_site_id + '. Are you sure?', sbox.length > 1, ( err, yes ) => {
					if ( ! yes ) {
						return;
					}

					sandbox.stop( sbox[0], err => {
						if ( err ) {
							return console.error( err );
						}
					});
				});
			});
		});
	});

program
	.command( 'delete <site>' )
	.description( 'Delete existing sandbox' )
	.action( ( site, options ) => {
		utils.findSite( site, ( err, site ) => {
			if ( err ) {
				return console.error( err );
			}

			if ( ! site ) {
				return console.error( 'Specified site does not exist. Try the ID.' );
			}

			sandbox.getSandboxesForSite( site, ( err, sbox ) => {
				if ( err ) {
					return console.error( err );
				}

				if ( ! sbox ) {
					return console.error( 'Sandbox does not exist for requested site.' );
				}

				utils.maybeConfirm( 'This will delete all containers for site '  + sbox[0].client_site_id + '. Are you sure?', sbox.length > 1, ( err, yes ) => {
					if ( ! yes ) {
						return;
					}

					return api
						.del( '/sandboxes/' + sbox[0].id )
						.end( err => {
							if ( err ) {
								console.error( err.response.error );
							}
						});
				});
			});
		});
	});

program
	.command( 'purge' )
	.description( 'Delete all stopped sandbox containers' )
	.action( () => {
		const opts = {
			state: 'stopped',
		};

		sandbox.getSandboxes( opts, ( err, data ) => {
			if ( err ) {
				return console.error( err );
			}

			const sandboxes = data.data;

			if ( ! sandboxes.length ) {
				return console.error( 'No stopped sandbox containers found.' );
			}

			console.log( 'We found the following stopped sandbox containers:' );

			sandbox.displaySandboxes( sandboxes );

			utils.maybeConfirm( `Are you sure you want to delete all ${ sandboxes.length } of your sandbox containers?`, true, ( err, yes ) => {
				if ( ! yes ) {
					return;
				}

				async.eachSeries( sandboxes, ( s, done ) => {
					const container = s.containers[0];
					console.log( `Deleting container ${ container.container_name } (#${ container.container_id })`  );
					sandbox.deleteSandbox( s.id, done );
				}, ( err ) => {
					if ( err ) {
						console.error( 'Failed to delete one or more sandboxes:' );
						console.error( err );
						return;
					}

					console.log( 'All done.' );
				});
			});
		});
	});

program.parse( process.argv );
if ( ! process.argv.slice( 2 ).length ) {
	program.outputHelp();
}
