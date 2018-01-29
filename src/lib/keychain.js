module.exports = {};

if ( typeof window === 'undefined' || typeof window.localStorage === 'undefined' ) {
	// node

	const os = require( 'os' );
	const LocalStorage = require( 'node-localstorage' ).LocalStorage;
	const localStorage = new LocalStorage( os.tmpdir() );

	module.exports.setPassword = function( service, password ) {
		return localStorage.setItem( service, password );
	};

	module.exports.getPassword = function( service ) {
		return localStorage.getItem( service );
	};

	module.exports.deletePassword = function( service ) {
		return localStorage.removeItem( service );
	};
} else {
	// browser

	module.exports.setPassword = function( service, password ) {
		return window.localStorage.setItem( service, password );
	};

	module.exports.getPassword = function( service ) {
		return window.localStorage.getItem( service );
	};

	module.exports.deletePassword = function( service ) {
		return window.localStorage.removeItem( service );
	};
}
