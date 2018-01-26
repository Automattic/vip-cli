module.exports = {};

if ( typeof window === 'undefined' || typeof window.localStorage === 'undefined' ) {
	try {
		// secure storage
		const keytar = require( 'keytar-prebuild' );
		module.exports.setPassword = keytar.setPassword;
		module.exports.getPassword = keytar.getPassword;
		module.exports.deletePassword = keytar.deletePassword;
	} catch ( e ) {
		// fallback to insecure storage
		const os = require( 'os' );
		const LocalStorage = require( 'node-localstorage' ).LocalStorage;
		const localStorage = new LocalStorage( os.tmpdir() );

		module.exports.setPassword = function( service, user, password ) {
			localStorage.setItem( `${ service }.${ user }`, password );
		};

		module.exports.getPassword = function( service, user ) {
			localStorage.getItem( `${ service }.${ user }` );
		};

		module.exports.deletePassword = function( service, user ) {
			localStorage.removeItem( `${ service }.${ user }` );
		};
	}
} else {
	// browser
	module.exports.setPassword = function( service, user, password ) {
		window.localStorage.setItem( `${ service }.${ user }`, password );
	};

	module.exports.getPassword = function( service, user ) {
		window.localStorage.getItem( `${ service }.${ user }` );
	};

	module.exports.deletePassword = function( service, user ) {
		window.localStorage.removeItem( `${ service }.${ user }` );
	};
}
