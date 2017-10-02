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
	if ( 'function' === typeof opts ) {
		callback = opts;
		opts = {};
	}

	opts = Object.assign({
		masterdb: true,
	}, opts );

	// Convert DB object to connection args
	var getCLIArgsForConnectionHost = function( db ) {
		return [
			`-h${db.host}`,
			`-P${db.port}`,
			`-u${db.username}`,
			db.name,
			`-p${db.password}`,
		];
	};

	api
		.get( '/sites/' + site.client_site_id + '/db' )
		.end( ( err, res ) => {
			if ( err ) {
				return callback( err.response.error );
			}

			const connections = res.body.data;

			if ( ! connections || ! connections.length ) {
				return callback( new Error( 'The site either has no active database connections or something went wrong.' ) );
			}

			let connection;
			if ( opts.masterdb ) {
				connection = connections.find( connection => true === connection.is_master_db );
			} else {
				// Put slave dbs first and pick the first one
				connections.sort( ( a, b ) => a.is_master_db - b.is_master_db );
				connection = connections[0];
			}

			if ( ! connection ) {
				return callback( new Error( 'Could not find a suitable database connection' ) );
			}

			const args = getCLIArgsForConnectionHost( connection );

			callback( null, args );
		});
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

		// Block limit-less updates and selects
		args.push( '--safe-updates' );

		spawn( 'mysql', args, { stdio: 'inherit' });
	});
}

export function query( site, query, callback ) {
	getConnection( site, ( err, args ) => {
		if ( err ) {
			return callback( err );
		}

		args.push( '--safe-updates' );
		args.push( '-e', query );

		spawn( 'mysql', args, { stdio: 'inherit' });
	});
}
