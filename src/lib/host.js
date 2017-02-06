// Ours
const api = require( '../lib/api' );

export function getHostAction( hostId, actionId ) {
	return new Promise( ( resolve, reject ) => {
		api
			.get( '/hosts/' + hostId + '/actions/' + actionId )
			.end( ( err, res ) => {
				if ( err ) {
					if ( 404 != err.status ) {
						return reject( new Error( 'Failed to get host action: ' + err.response.error ) );
					}
					return resolve( null );
				}

				return resolve( res.body.data[0] );
			});
	});
}
