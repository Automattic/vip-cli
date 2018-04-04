const spawn = require( 'child_process' ).spawnSync;
const Table = require( 'cli-table' );
const colors = require( 'colors/safe' );
const log = require( 'single-line-log' ).stderr;
const hostname = require( 'os' ).hostname();

// Ours
const api = require( './api' );
const config = require( './config' );
const utils = require( './utils' );

function isSandbox( hostname ) {
	return /^\w+\.dev\.\w{3}\.vipv2\.net/.test( hostname );
}

export function getSandboxAndRun( site, command, opts ) {
	getSandboxForSite( site, ( err, sbox ) =>  {
		if ( err ) {
			return console.error( err );
		}

		if ( ! sbox ) {
			return createSandboxForSite( site, ( err, sbox ) => {
				if ( err ) {
					return console.error( err );
				}

				runOnExistingContainer( site, sbox, command, opts );
			});
		}

		runOnExistingContainer( site, sbox, command, opts );
	});
}

export function runOnExistingContainer( site, sandbox, command, opts ) {
	opts = opts || {};

	if ( isSandbox( sandbox.host_name ) && hostname !== sandbox.host_name ) {
		return console.error( 'Cannot run command on dedicated sandbox remotely' );
	}

	const runCommand = isSandbox( sandbox.host_name ) ? dockerRunCommand : sshRunCommand;
	maybeStateTransition( site, state => {
		switch( state ) {
		case 'stopped':
			return start( sandbox, site, ( err, sandbox ) => {
				if ( err ) {
					return console.error( err.response.error );
				}

				runCommand( sandbox, command, opts );
			});
		case 'running':
			return runCommand( sandbox, command, opts );
		default:
			return console.error( 'Cannot start sandbox for requested site' );
		}
	});
}

function sshRunCommand( sandbox, command, opts ) {
	opts = Object.assign({
		confirm: false,
	}, opts || {});

	// TODO: Don't need to hardcode the port when this is in the API
	sandbox.ssh_port = 4100;

	const args = [
		`vipdev@${ sandbox.host_name }`,
		'-p', sandbox.ssh_port,
	];

	if ( ! isSandbox( hostname ) ) {
		args.push( '-L', `${ sandbox.ssh_port }:localhost:8080` );
	}

	spawn( 'ssh', args, { stdio: 'inherit' });
}

function dockerRunCommand( sandbox, command, opts ) {
	opts = Object.assign({
		'user': 'nobody',
		'confirm': false,
	}, opts || {});

	var run = [
		'exec',
		'--user', opts.user,
		'-it', sandbox.container_name,
		'env', 'TERM=xterm',
	];

	const notice = [];

	if ( ! command || command.length < 1 ) {
		run.push( 'bash' );

		notice.push( 'Logging in to sandbox:' );
	} else {
		run = run.concat( command );

		notice.push( 'Running command on container:' );
		notice.push( `-- Command: ${ command.join( ' ' ) }` );
	}

	if ( notice.length > 0 ) {
		notice.push( `-- Container: ${ sandbox.container_name }` );
		notice.push( `-- Site: ${ sandbox.domain_name } (#${ sandbox.client_site_id })` );

		utils.displayNotice( notice );
	}

	// TODO: Handle file references as arguments
	process.on( 'SIGHUP', () => {
		decrementSboxFile( sandbox );
	});

	utils.maybeConfirm( "Are you sure?", opts.confirm, ( err, yes ) => {
		if ( ! yes ) {
			return;
		}

		incrementSboxFile( sandbox, err => {
			if ( err ) {
				return console.error( err );
			}

			spawn( 'docker', run, { stdio: 'inherit' });

			decrementSboxFile( sandbox, err => {
				if ( err ) {
					return console.error( err );
				}
			});
		});
	});
}

function maybeStateTransition( site, cb ) {
	var poll = setInterval( () => {
		getSandboxForSite( site, ( err, container ) => {
			if ( err ) {
				return console.error( err.message );
			}

			switch( container.state ) {
			case 'starting':
			case 'stopping':
			case 'pausing':
				return utils.showLoading( 'Container state transition: ' + container.state );
			default:
				clearInterval( poll );
				cb( container.state );
			}
		});
	}, 1000 );
}

function incrementSboxFile( sandbox, cb ) {
	config.get( 'sandbox', ( err, list ) => {
		if ( err && err.code !== 'ENOENT' ) {
			return cb( err );
		}

		if ( ! list ) {
			list = {};
		}

		if ( ! list[ sandbox.id ] ) {
			list[ sandbox.id ] = 1;
		} else {
			list[ sandbox.id ]++;
		}

		config.set( 'sandbox', list, err => {
			return cb( err );
		});
	});
}

function decrementSboxFile( sandbox, cb ) {
	config.get( 'sandbox', ( err, list ) => {
		if ( err && err.code !== 'ENOENT' ) {
			return cb( err );
		}

		if ( ! list ) {
			list = {};
		}

		if ( ! list[ sandbox.id ] ) {
			list[ sandbox.id ] = 0;
		} else {
			list[ sandbox.id ]--;
		}

		config.set( 'sandbox', list, err => {
			if ( err ) {
				return cb( err );
			}

			if ( list[ sandbox.id ] === 0 ) {
				// Stop the container when we're done with it
				// We don't strictly care about the response as long as it works most of the time :)
				api
					.post( '/sandboxes/' + sandbox.id + '/stop' )
					.end();
			}
		});
	});
}

function start( sandbox, site, cb ) {
	return api
		.post( '/sandboxes/' + sandbox.id )
		.end( ( err, res ) => {
			if ( err ) {
				return cb( err );
			}

			waitForRunningSandbox( site, ( err, sandbox ) => {
				cb( null, sandbox );
			});
		});
}

export function stop( sandbox, cb ) {
	config.get( 'sandbox', ( err, list ) => {
		if ( err && err.code !== 'ENOENT' ) {
			return cb( err );
		}

		if ( ! list ) {
			list = {};
		}

		if ( ! list[ sandbox.id ] ) {
			list[ sandbox.id ] = 0;
		} else {
			list[ sandbox.id ]--;
		}

		list[ sandbox.id ] = 0;
		config.set( 'sandbox', list, err => {
			if ( err ) {
				return cb( err );
			}

			api
				.post( '/sandboxes/' + sandbox.id + '/stop' )
				.end();
		});
	});
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
			var running = res.body.data.filter( s => {
				return s.containers[0].state !== 'stopped';
			}).length;

			if ( running > 5 ) {
				console.error( 'Error: Too many running sandbox containers. Clean some of them up with `vip sandbox stop <site>` before creating another.' );
				listSandboxes();
				return;
			}

			if ( total > 20 ) {
				console.log( 'Warning: There are more than 20 total sandbox containers on this host. Consider deleting some unused ones with `vip sandbox delete <site>`' );
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

			var containers = data[0].containers.map( c => {
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
				return utils.showLoading( 'Waiting for sandbox to start' );
			}

			clearInterval( poll );
			cb( err, sbox );
		});
	}, 1000 );
}

export function getSandboxes( opts = {}, cb ) {
	const query = Object.assign({
		api_user_id: api.auth.apiUserId,
		state: 'any',
	}, opts );

	api
		.get( '/sandboxes' )
		.query( query )
		.end( ( err, res ) => {
			if ( err ) {
				return cb( err.response.error );
			}

			cb( err, res.body );
		});
}

export function listSandboxes( opts, cb ) {
	getSandboxes( opts, ( err, data ) => {
		if ( err ) {
			return console.error( err.response.error );
		}

		const sandboxes = data.data;

		displaySandboxes( sandboxes );

		if ( cb ) {
			cb();
		}
	});
}

export function displaySandboxes( sandboxes, opts ) {
	var headers = [ 'Site ID', 'Site Name', 'State' ];

	if ( opts && opts.index ) {
		headers.unshift( '#' );
	}

	var table = new Table({
		head: headers,
		style: {
			head: ['blue'],
		},
	});

	var i = 1;
	sandboxes.forEach( s => {
		s.containers.forEach( c => {
			switch ( c.state ) {
			case 'stopped':
			case 'stopping':
				c.state = colors['red']( c.state );
				break;

			case 'running':
				c.state = colors['green']( c.state );
				break;
			}

			var row = [ s.site.client_site_id, s.site.name || s.site.domain_name, c.state ];

			if ( opts && opts.index ) {
				row.unshift( i++ );
			}

			table.push( row );
		});
	});

	console.log( table.toString() );
}

export function deleteSandbox( id, cb ) {
	api
		.del( '/sandboxes/' + id )
		.end( err => {
			if ( err ) {
				return cb( err.response.error );
			}

			cb();
		});
}
