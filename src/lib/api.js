const vip = require( 'vip' );
const api = new vip();
const colors = require( 'colors' );

function uncaughtError( err ) {
	console.log();
	console.log( ' ', colors.red( '✕' ), ' Unexpected error: Please contact the Platform team with the following error:' );
	console.log( ' ', colors.dim( err.stack ) );
}
process.on( 'uncaughtException', uncaughtError );
process.on( 'unhandledRejection', uncaughtError );

// Timeout after 5s
api.API_TIMEOUT = 5000;

// Add environment variables
const { getEnv } = require( './config' );
getEnv( 'PROXY', ( err, proxy ) => {
	if ( err || ! proxy ) {
		return;
	}

	api.proxy = proxy;
});

// Inject credentials
const { getCredentials } = require( './utils' );
getCredentials( function( err, credentials ) {
	if ( err ) {
		return;
	}

	api.auth.apiUserId = credentials.userId;
	api.auth.token = credentials.accessToken;
	api.caps = credentials.caps;
});

export const auth = api.auth;

function handleAuth( request ) {
	var callback = request.callback;
	request.callback = function( err, res ) {
		if ( err && err.code === 'ECONNABORTED' ) {
			console.error( `${ request.method } ${ request.url }` );
			return console.error( colors.red( '✕' ), ' API Timeout: Ensure your PROXY is correctly configured. https://wp.me/PCYsg-fQp#setup' );
		}

		if ( res.status === 401 ) {
			return console.error( 'Invalid or expired token. Please login with `vipgo login`' );
		}

		callback.call( request, err, res );
	};
}

export function get( url ) {
	return api.get( url ).use( handleAuth );
}

export function post( url ) {
	return api.post( url ).use( handleAuth );
}

export function put( url ) {
	return api.put( url ).use( handleAuth );
}

export function del( url ) {
	return api.del( url ).use( handleAuth );
}

// caps
export function currentUserCan( cap, action ) {
	return api.currentUserCan( cap, action );
}
export function currentUserCanRead( cap ) {
	return api.currentUserCanRead( cap );
}
export function currentUserCanEdit( cap ) {
	return api.currentUserCanEdit( cap );
}
export function currentUserCanAdd( cap ) {
	return api.currentUserCanAdd( cap );
}
export function currentUserCanDelete( cap ) {
	return api.currentUserCanDelete( cap );
}
