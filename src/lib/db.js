const fs = require( 'fs' );
const spawn = require('child_process').spawn;
const PV = require( 'node-pv' );
const Throttle = require( 'throttle' );

// Ours
const api = require( './api' );

function getConnection( site, callback ) {
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
}

export function importDB( site, file, opts, callback ) {

	// Default opts
	opts = Object.assign({
		throttle: 1, // 1 MB
	}, opts);

	getConnection( site, ( err, args ) => {
		if ( err ) {
			return callback( err );
		}

		var stats = fs.lstatSync( file );
		var pv = new PV({
			size: stats.size
		});

		pv.on('info', info => {
			process.stderr.write( info );
		});

		var throttle = new Throttle( 1024 * 1024 * opts.throttle );
		var stream = fs.createReadStream( file );
		var importdb = spawn( 'mysql', args, { stdio: [ 'pipe', process.stdout, process.stderr ] } );
		stream.pipe(throttle).pipe(pv).pipe( importdb.stdin );
	});
}

export function exportDB( site, callback ) {
	getConnection( site, ( err, args ) => {
		if ( err ) {
			return callback( err );
		}

		spawn( 'mysqldump', args, { stdio: 'inherit' } );
	});
}

export function getCLI( site, connection ) {
	getConnection( site, ( err, args ) => {
		if ( err ) {
			return callback( err );
		}

		spawn( 'mysql', args, { stdio: 'inherit' } );
	});
}
