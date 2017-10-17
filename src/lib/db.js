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

	if ( opts.masterdb ) {
		api
			.get( '/sites/' + site.client_site_id + '/masterdb' )
			.end( ( err, res ) => {
				if ( err ) {
					return callback( err.response.error );
				}

				var args = getCLIArgsForConnectionHost( res.body );

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

				if ( conns.length > 0 ) {
					// Random DB slave
					var connection = conns[Math.floor( Math.random()*conns.length )];
					var args = getCLIArgsForConnectionHost( connection );

					callback( null, args );
				} else {
					// If there are no slaves, use the master
					console.error( 'No slaves are available, getting connection to master' );
					opts.masterdb = true;
					getConnection( site, opts, callback );
				}
			});
	}
}

export function importDB( site, file, opts, callback ) {

	// Default opts
	opts = Object.assign({
		throttle: 1, // 1 MB
		replace: {},
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

		stream = stream.pipe( throttle ).pipe( pv );

		Object.keys( opts.replace ).forEach( from => {
			let to = opts.replace[from];
			// TODO: Build & distribute go-search-replace with vip-cli
			let replace = spawn( 'go-search-replace', [ from, to ], { stdio: ['pipe', 'pipe', process.stderr] });
			stream = stream.pipe( replace );
		});

		stream.pipe( importdb.stdin );
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
