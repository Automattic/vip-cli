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
		.end( ( err, res ) => {
			// Poll for sandbox
			var poll = setInterval( () => {
				getSandboxForSite( site, ( err, sandbox ) => {
					if ( err ) {
						// API error, bail
						clearInterval( poll );
						return cb( err );
					}

					if ( ! sandbox ) {
						return console.log( 'Waiting for sandbox container to start...' );
					}

					clearInterval( poll );
					cb( err, sandbox );
				});
			}, 1000 );
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
