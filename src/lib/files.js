// Ours
const api = require( './api' );

export function list( site, opts ) {
	return new Promise( ( resolve, reject ) => {
		api
			.get( '/sites/' + site.client_site_id + '/files' )
			.query( opts )
			.end( ( err, res ) => {
				if ( err ) {
					let message = err.response.error;
					if ( err.response.body ) {
						message += ' | ' + err.response.body.message;
					}

					return reject( new Error( message ) );
				}

				if ( ! res.body || 'success' !== res.body.status ) {
					return reject( new Error( 'Failed to create rebuild/upgrade actions for site' ) );
				}

				return resolve( res.body );
			});
	});
}
