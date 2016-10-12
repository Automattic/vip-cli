const spawn = require('child_process').spawnSync;
const Table = require( 'cli-table' );

// Ours
const api = require( './api' );

export function runOnExistingContainer( site, sbox, command ) {
	switch( sbox.state ) {
		case 'stopped':
			return api
			.post( '/sandboxes/' + sbox.id )
			.end( ( err, res ) => {
				if ( err ) {
					return console.error( err.response.error );
				}

				waitForRunningSandbox( site, ( err, sbox ) => {
					runCommand( sbox, command );
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
					runCommand( sbox, command );
				});
			});
		case 'stopping':
		case 'pausing':
			return console.error( 'Sandbox state transition - try again in a few seconds...' );
		case 'running':
			return runCommand( sbox, command );
		default:
			return console.error( 'Cannot start sandbox for requested site' );
	}
}

export function runCommand( container, command ) {
	var run = [
		'exec',
		'-it', container.container_name,
		'env', 'TERM=xterm',
	];

	if ( ! command || command.length < 1 ) {
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

	// Stop the container when we're done with it
	// We don't strictly care about the response as long as it works most of the time :)
	api
		.post( '/containers/' + container.container_id + '/stop' )
		.end();
}

export function createSandboxForSite( site, cb ) {
	api
		.get( '/sandboxes' )
		.query({ 'api_user_id': api.auth.apiUserId, 'state': 'any' })
		.end( ( err, res ) => {
			if ( err ) {
				return cb( err );
			}

			var total = res.body.totalrecs;
			var running = res.body.data.filter(s => {
				return s.containers[0].state == 'running';
			}).length;

			if ( running >= 6 ) {
				console.error( 'Error: Too many running sandbox containers. Clean some of them up with `vip sandbox stop <site>` before creating another.' );
				listSandboxes();
				return;
			}

			if ( total >= 6 ) {
				console.log( 'Warning: There are more than 5 total sandbox containers on this host. Consider deleting some unused ones with `vip sandbox delete <site>`' );
			}

			api
				.post( '/sandboxes' )
				.send({ 'client_site_id': site.client_site_id })
				.end( err => {
					if ( err ) {
						return cb( err );
					}

					waitForRunningSandbox( site, ( err, sandbox ) => {
						cb( err, sandbox );
					});
				});
		});
}

export function getSandboxForSite( site, cb ) {
	getSandboxesForSite( site, ( err, containers ) => {
		if ( ! containers ) {
			return cb( err, null );
		}

		return cb( err, containers[0] );
	});
}

export function getSandboxesForSite( site, cb ) {
	api
		.get( '/sandboxes' )
		.query({
			'api_user_id': api.auth.apiUserId,
			'client_site_id': site.client_site_id,
			'state': 'any',
		})
		.end( ( err, res ) => {
			if ( err ) {
				return cb( err );
			}

			var data = res.body.data;

			if ( ! data || ! data[0] ) {
				return cb( null );
			}

			var containers = data[0].containers.map(c => {
				c.id = data[0].id;
				return c;
			});

			return cb( null, containers );
		});
}

export function waitForRunningSandbox( site, cb ) {
	var poll = setInterval( () => {
		getSandboxForSite( site, ( err, sbox ) => {
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

export function listSandboxes( opts, cb ) {
	var query = {
		api_user_id: api.auth.apiUserId,
		state: 'any',
	};

	if ( opts && opts.client_site_id ) {
		query.client_site_id = opts.client_site_id;
	}

	api
		.get( '/sandboxes' )
		.query( query )
		.end( ( err, res ) => {
			if ( err ) {
				return console.error( err );
			}

			var headers = [ 'Site ID', 'Site Name', 'State' ];

			if ( opts && opts.index ) {
				headers.unshift( '#' );
			}

			var table = new Table({
				head: headers,
			});

			var i = 1;
			res.body.data.forEach(s => {
				s.containers.forEach(c => {
					var row = [ s.site.client_site_id, s.site.name || s.site.domain_name, c.state ];

					if ( opts && opts.index ) {
						row.unshift( i++ );
					}

					table.push(row);
				});
			});

			console.log( table.toString() );

			if ( cb ) {
				cb();
			}
		});
}
