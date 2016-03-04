var utils = {
	setCredentials: function( credentials, callback ) {
		var keychain = require( 'xkeychain' );
		console.log( credentials );

		credentials.userId      = credentials.userId || '';
		credentials.accessToken = credentials.accessToken || '';

		var tokenString = credentials.userId + '|' + credentials.accessToken;

		return keychain.setPassword({ account: 'VIP CLI', service: 'VIP CLI', password: tokenString }, callback );
	},
	getCredentials: function( callback ){
		var keychain = require( 'xkeychain' );

		keychain.getPassword({ account: 'VIP CLI', service: 'VIP CLI' }, function( err, password ) {
			if ( err ) {
				return callback( err );
			}

			var split = password.split( '|', 2 );

			var credentials = {
				userId:      split[0] || null,
				accessToken: split[1] || null
			};

			return callback( null, credentials );
		});
	}
};

module.exports = utils;
