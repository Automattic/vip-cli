#!/usr/bin/env node

const program = require( 'commander' );
const promptly = require( 'promptly' );
const Table = require( 'cli-table' );

// Ours
const api = require( '../lib/api' );
const sandbox = require( '../lib/sandbox' );
const utils = require( '../lib/utils' );

function maybePrompt( site, prompt, cb ) {
	if ( prompt ) {
		sandbox.listSandboxes( { client_site_id: site, index: true }, () => {
			promptly.prompt( 'Which container?', { default: 1 }, ( err, container ) => {
				if ( err ) {
					return console.error( err );
				}

				cb( container );
			});
		});
	} else {
		cb()
	}
}

program
	.command( 'list' )
	.description( 'List existing sandboxes' )
	.action( () => {
		sandbox.listSandboxes();
	});

program
	.command( 'start <site>' )
	.description( 'Start a sandbox' )
	.action( site => {
		utils.findSite( site, ( err, site ) => {
			if ( err ) {
				return console.error( err );
			}

			if ( ! site ) {
				return console.error( 'Specified site does not exist. Try the ID.' );
			}

			sandbox.getSandboxForSite( site, ( err, sbox ) =>  {
				if ( err ) {
					return console.error( err );
				}

				if ( ! sbox ) {
					return sandbox.createSandboxForSite( site, ( err, sbox ) => {
						if ( err ) {
							return console.error( err );
						}

						sandbox.runOnExistingContainer( site, sbox );
					});
				}

				sandbox.runOnExistingContainer( site, sbox );
			});
		});
	});

program
	.command( 'stop <site>' )
	.description( 'Stop existing sandbox' )
	.option( '--all', 'Stop all running sandbox containers' )
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
						sbox = sbox.slice(container - 1, container);
					}

					sbox.forEach(sbox => {
						switch( sbox.state ) {
							case 'running':
							case 'paused':
								return api
									.post( '/containers/' + sbox.container_id + '/stop' )
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
							case 'stopped':
								return console.error( 'Requested container is already stopped' );
							default:
								return console.error( 'Cannot stop sandbox for requested site' );
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
						sbox = sbox.slice(container - 1, container);
					}

					sbox.forEach(sbox => {
						if ( sbox.state == 'running' ) {
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

				maybePrompt( site.client_site_id, sbox.length > 1 && ! options.all, container => {
					if ( container < 1 || container > sbox.length ) {
						return console.error( 'Invalid container' );
					} else if ( container ) {
						sbox = sbox.slice(container - 1, container);
					}

					promptly.confirm( 'Warning: Deleting this container will destroy uncomitted work. Are you sure?', ( err, yes ) => {
						if ( ! yes ) {
							return;
						}

						sbox.forEach(sbox => {
							if ( sbox.state !== 'stopped' ) {
								return console.error( 'Requested sandbox must be stopped before it can be deleted' );
							}

							api
								.post( '/containers/' + sbox.container_id + '/delete' )
								.end( err => {
									if ( err ) {
										return console.error( err.response.error );
									}
								});
						});
					});
				});
			});
		});
	});

program.parse(process.argv);
if ( ! process.argv.slice( 2 ).length ) {
	program.outputHelp();
}
