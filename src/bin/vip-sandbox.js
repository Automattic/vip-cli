#!/usr/bin/env node

const program = require( 'commander' );
const promptly = require( 'promptly' );
const Table = require( 'cli-table' );

// Ours
const api = require( '../lib/api' );
const sandbox = require( '../lib/sandbox' );
const utils = require( '../lib/utils' );

function waitForRunningSandbox( site, cb ) {
	var poll = setInterval( () => {
		sandbox.getSandboxForSite( site, ( err, sbox ) => {
			if ( err ) {
				// API error, bail
				clearInterval( poll );
				return cb( err );
			}

			if ( ! sbox || sbox.state !== 'running' ) {
				return console.log( 'Waiting for sandbox to start...' );
			}

			clearInterval( poll );
			cb( err, sbox );
		});
	}, 1000 );
}

program
	.command( 'list' )
	.description( 'List existing sandboxes' )
	.action( () => {
		api
			.get( '/sandboxes' )
			.query({
				api_user_id: api.auth.apiUserId,
				state: 'any',
			})
			.end( ( err, res ) => {
				if ( err ) {
					return console.error( err );
				}

				var table = new Table({
					head: [ 'ID', 'Site Name', 'State' ],
				});

				res.body.data.forEach(s => {
					table.push([ s.site.client_site_id, s.site.name || s.site.domain_name, s.containers[0].state ]);
				});

				console.log( table.toString() );
			});
	});

program
	.command( 'start <site>' )
	.description( 'Start existing sandbox' )
	.action( site => {
		utils.findSite( site, ( err, site ) => {
			sandbox.getSandboxForSite( site, ( err, sbox ) =>  {
				if ( err ) {
					return console.error( err );
				}

				if ( ! sbox ) {
					return console.error( 'Sandbox does not exist for requested site.' );
				}

				switch( sbox.state ) {
					case 'stopped':
						return api
							.post( '/containers/' + sbox.container_id + '/start' )
							.end( ( err, res ) => {
								if ( err ) {
									return console.error( err );
								}

								waitForRunningSandbox( site, ( err, sbox ) => {
									sandbox.runCommand( sbox );
								});
							});
					case 'paused':
						return api
							.post( '/containers/' + sbox.container_id + '/unpause' )
							.end( ( err, res ) => {
								if ( err ) {
									return console.error( err.response.error );
								}

								waitForRunningSandbox( site, ( err, sbox ) => {
									sandbox.runCommand( sbox );
								});
							});
					case 'running':
						return sandbox.runCommand( sbox );
					default:
						return console.error( 'Cannot start sandbox for requested site' );
				}
			});
		});
	});

program
	.command( 'stop <site>' )
	.description( 'Stop existing sandbox' )
	.action( site => {
		utils.findSite( site, ( err, site ) => {
			sandbox.getSandboxForSite( site, ( err, sbox ) => {
				if ( err ) {
					return console.error( err );
				}

				if ( ! sbox ) {
					return console.error( 'Sandbox does not exist for requested site.' );
				}

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
					case 'stopped':
						return console.error( 'Requested container is already stopped' );
					default:
						return console.error( 'Cannot stop sandbox for requested site' );
				}
			});
		});
	});

program
	.command( 'pause <site>' )
	.description( 'Pause existing sandbox' )
	.action( site => {
		utils.findSite( site, ( err, site ) => {
			sandbox.getSandboxForSite( site, ( err, sbox ) => {
				if ( err ) {
					return console.error( err );
				}

				if ( ! sbox ) {
					return console.error( 'Sandbox does not exist for requested site.' );
				}

				switch( sbox.state ) {
					case 'running':
						return api
							.post( '/containers/' + sbox.container_id + '/pause' )
							.end( err => {
								if ( err ) {
									console.error( err.response.error );
								}
							});
					case 'paused':
						return console.error( 'Requested sandbox is already paused' );
					default:
						return console.error( 'Cannot pause sandbox for requested site' );
				}
			});
		});
	});

program
	.command( 'delete <site>' )
	.description( 'Delete existing sandbox' )
	.action( site => {
		utils.findSite( site, ( err, site ) => {
			sandbox.getSandboxForSite( site, ( err, sbox ) => {
				if ( err ) {
					return console.error( err );
				}

				if ( ! sbox ) {
					return console.error( 'Sandbox does not exist for requested site.' );
				}

				if ( sbox.state !== 'stopped' ) {
					return console.error( 'Requested sandbox must be stopped before it can be deleted' );
				}

				promptly.confirm( 'Warning: Deleting this container will destroy uncomitted work. Are you sure?', ( err, yes ) => {
					if ( ! yes ) {
						return;
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

program.parse(process.argv);
if ( ! process.argv.slice( 2 ).length ) {
	program.outputHelp();
}
