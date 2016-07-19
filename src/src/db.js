const spawn = require('child_process').spawn;
const api = require( '../src/api' );

module.exports = {
	exportDB: function( site, callback ) {
		this.getConnection( site, ( err, args ) => {
			if ( err ) {
				return callback( err );
			}

			spawn( 'mysqldump', args, { stdio: 'inherit' } );
		});
	},
	getCLI: function( site, callback ) {
		this.getConnection( site, ( err, args ) => {
			if ( err ) {
				return callback( err );
			}

			spawn( 'mysql', args, { stdio: 'inherit' } );
		});
	},
	getConnection: function( site, callback ) {
		api
		.get( '/sites/' + site.client_site_id + '/masterdb' )
		.end( ( err, res ) => {
			if ( err ) {
				return callback( err );
			}

			var args = [
				`-h${res.body.host}`,
				`-P${res.body.port}`,
				`-u${res.body.username}`,
				res.body.name,
				`-p${res.body.password}`,
			];

			callback( null, args );
		});
	},
};
