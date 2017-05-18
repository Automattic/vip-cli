const fs = require( 'fs' );
const spawn = require( 'child_process' ).spawn;
const PV = require( 'node-pv' );
const Throttle = require( 'throttle' );
const path = require( 'path' );

// zlib
const zlib = require( 'zlib' );
const gunzip = zlib.createGunzip();
const unzip = zlib.createUnzip();

// Ours
const api = require( './api' );

function getConnection( site, opts, callback ) {
	if ( callback == null ) {
		callback = opts;
		opts = {};
	}

	opts = Object.assign({
		masterdb: true,
	}, opts );

	if ( opts.masterdb ) {
		api
			.get( '/sites/' + site.client_site_id + '/masterdb' )
			.end( ( err, res ) => {
				if ( err ) {
					return callback( err.response.error );
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
	} else {
		api
			.get( '/sites/' + site.client_site_id + '/slavedb' )
			.end( ( err, res ) => {
				if ( err ) {
					return callback( err.response.error );
				}

				var conns = res.body.data;

				// Random DB slave
				var connection = conns[Math.floor( Math.random()*conns.length )];

				var args = [
					`-h${connection.host}`,
					`-P${connection.port}`,
					`-u${connection.username}`,
					connection.name,
					`-p${connection.password}`,
				];

				callback( null, args );
			});
	}
}

export function importDB( site, file, opts, callback ) {

	// Default opts
	opts = Object.assign({
		throttle: 1, // 1 MB
	}, opts );

	getConnection( site, ( err, args ) => {
		if ( err ) {
			return callback( err );
		}

		var stats = fs.lstatSync( file );
		var pv = new PV({
			size: stats.size,
		});

		pv.on( 'info', info => {
			process.stderr.write( info );
		});

		var throttle = new Throttle( 1024 * 1024 * opts.throttle );
		var stream = fs.createReadStream( file );
		var importdb = spawn( 'mysql', args, { stdio: [ 'pipe', process.stdout, process.stderr ] });

		// Handle compressed mysqldumps
		switch( path.extname( file ) ) {
		case '.gz':
			stream = stream.pipe( gunzip );
			break;

		case '.zip':
			stream = stream.pipe( unzip );
			break;
		}

		stream.pipe( throttle ).pipe( pv ).pipe( importdb.stdin );
	});
}

export function exportDB( site, callback ) {
	getConnection( site, { masterdb: false }, ( err, connectionArgs ) => {
		if ( err ) {
			return callback( err );
		}

		let args = connectionArgs.concat( [ '--single-transaction', '--quick' ] );

		spawn( 'mysqldump', args, { stdio: 'inherit' });
	});
}

export function getCLI( site, callback ) {
	getConnection( site, ( err, args ) => {
		if ( err ) {
			return callback( err );
		}

		spawn( 'mysql', args, { stdio: 'inherit' });
	});
}
