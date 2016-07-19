const fs = require( 'fs' );
const spawn = require('child_process').spawnSync;
const api = require( '../src/api' );

module.exports = {
	importDB: function( site, file, callback ) {
		this.getConnection( site, ( err, args ) => {
			if ( err ) {
				return callback( err );
			}

			var stream = fs.createReadStream( file );
			stream.on( 'open', () => {
				spawn( 'mysql', args, { stdio: [ stream, process.stdout, process.stderr ] } );
			});
		});
	},
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
