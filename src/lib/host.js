// Ours
const api = require( '../lib/api' );

export function createHostAction( host_id, action_type, payload ) {
	return new Promise( ( resolve, reject ) => {
		api
			.post( '/hosts/' + host_id + '/actions' )
			.send({
				host_id: host_id,
				action_type: action_type,
				payload: payload || {},
			})
			.end( ( err, res ) => {
				if ( err ) {
					return reject( new Error( 'Failed to create host action: ' + err.response.error ) );
				}

				return resolve( res.body );
			});
	});
}

export function getHostActions( opts ) {
	opts = opts || {};

	return new Promise( ( resolve, reject ) => {
		api
			.get( '/actions' )
			.query( opts )
			.end( ( err, res ) => {
				if ( err ) {
					return reject( new Error( 'Failed to get host actions: ' + err.response.error ) );
				}

				return resolve( res.body.data );
			});
	});
}

export function getHostAction( hostId, actionId ) {
	return new Promise( ( resolve, reject ) => {
		api
			.get( '/hosts/' + hostId + '/actions/' + actionId )
			.end( ( err, res ) => {
				if ( err ) {
					if ( 404 !== err.status ) {
						return reject( new Error( 'Failed to get host action: ' + err.response.error ) );
					}
					return resolve( null );
				}

				return resolve( res.body.data[0] );
			});
	});
}
