#!/usr/bin/env node

const program = require( 'commander' );
const promptly = require( 'promptly' );

// Ours
const api = require( '../lib/api' );
const sandbox = require( '../lib/sandbox' );
const utils = require( '../lib/utils' );

function maybePrompt( site, prompt, cb ) {
	if ( prompt ) {
		sandbox.listSandboxes({ client_site_id: site, index: true }, () => {
			promptly.prompt( 'Which container?', { default: 1 }, ( err, container ) => {
				if ( err ) {
					return console.error( err );
				}

				cb( container );
			});
		});
	} else {
		cb();
	}
}

program
	.command( 'list' )
	.alias( 'ls' )
	.description( 'List existing sandboxes' )
	.action( () => {
		sandbox.listSandboxes();
	});

program
	.command( 'run <site> <command...>' )
	.description( 'Run a wp-cli command on a sandbox container' )
	.option( '--skip-confirm', 'Run the command without asking for confirmation' )
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
	.description( 'Start a sandbox and switch you to the container namespace' )
	.option( '-r, --root', 'Start sandbox as root' )
	.action( ( site, options ) => {
		utils.findSite( site, ( err, site ) => {
			if ( err ) {
				return console.error( err );
			}

			if ( ! site ) {
				return console.error( 'Specified site does not exist. Try the ID.' );
			}

			var opts = {};
			if ( options.root ) {
				opts.user = 'root';
			}

			sandbox.getSandboxAndRun( site, null, opts );
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
	.command( 'pause <site>' )
	.description( 'Pause existing sandbox' )
	.option( '--all', 'Pause all running sandbox containers' )
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

				maybePrompt( site.client_site_id, sbox.length > 1 && ! options.all, container => {
					if ( container < 1 || container > sbox.length ) {
						return console.error( 'Invalid container' );
					} else if ( container ) {
						sbox = sbox.slice( container - 1, container );
					}

					sbox.forEach( sbox => {
						if ( sbox.state === 'running' ) {
							return api
								.post( '/containers/' + sbox.container_id + '/pause' )
								.end( err => {
									if ( err ) {
										console.error( err.response.error );
									}
								});
						}

						// We don't care about non-running containers for bulk actions
						if ( options.all ) {
							return;
						}

						switch( sbox.state ) {
						case 'paused':
							return console.error( 'Requested sandbox is already paused' );
						default:
							return console.error( 'Cannot pause sandbox for requested site' );
						}
					});
				});
			});
		});
	});

program
	.command( 'delete <site>' )
	.description( 'Delete existing sandbox' )
	.option( '--all', 'Delete all stopped sandbox containers' )
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

program.parse( process.argv );
if ( ! process.argv.slice( 2 ).length ) {
	program.outputHelp();
}
