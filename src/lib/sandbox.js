const spawn = require('child_process').spawn;

// Ours
const api = require( './api' );

export function runCommand( container, command, cb ) {
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
}

export function createSandboxForSite( site, cb ) {
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
}

export function getSandboxForSite( site, cb ) {
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

			return cb( null, data[0].containers[0] );
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
