const fs = require( 'fs' );
const spawn = require( 'child_process' ).spawn;
const PV = require( 'node-pv' );
const Throttle = require( 'throttle' );
const path = require( 'path' );
const readline = require(  'readline' );

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
				connection = connections.find( connection => true === connection.is_db_master );
			} else {
				// Put slave dbs first and pick the first one
				connections.sort( ( a, b ) => a.is_db_master - b.is_db_master );
				connection = connections[0];
			}

			if ( ! connection ) {
				return callback( new Error( 'Could not find a suitable database connection' ) );
			}

			const args = getCLIArgsForConnectionHost( connection );

			callback( null, args );
		});
}

function validateSQLFile( file, callback ) {
	let errors = [];

	const rl = readline.createInterface({
		input: fs.createReadStream( file ),
	});

	rl.on( 'line', line => {
		if ( line.indexOf( 'use' ) === 0 ) {
			errors.push( new Error( 'Invalid use statement' ) );
		}

		if ( line.indexOf( 'CREATE DATABASE' ) === 0 ) {
			errors.push( new Error( 'Invalid CREATE DATABASE operation' ) );
		}

		if ( line.indexOf( 'DROP DATABASE' ) === 0 ) {
			errors.push( new Error( 'Invalid DROP DATABASE operation' ) );
		}

		if ( line.indexOf( 'ALTER USER' ) === 0 || line.indexOf( 'SET PASSWORD' ) === 0 ) {
			errors.push( new Error( 'Invalid user update' ) );
		}
	});

	rl.on( 'close', () => {
		callback( errors );
	});
}

function sanitizeSQLFile() {
	const { Transform } = require( 'stream' );
	return new Transform({
		transform( chunk, encoding, callback ) {
			if ( this._last === undefined ) {
				this._last = '';
			}

			if ( encoding === 'buffer' ) {
				chunk = chunk.toString();
			}

			this._last += chunk;

			// Split chunks on \n to make search/replace easier
			let list = this._last.split( '\n' );
			this._last = list.pop();

			for ( let i = 0; i < list.length; i++ ) {
				let line = list[i];

				// Ensure all tables use InnoDB
				if ( line.indexOf( 'ENGINE=MyISAM' ) > -1 ) {
					line = line.replace( 'ENGINE=MyISAM', 'ENGINE=InnoDB' );
				}

				this.push( line + '\n' );
			}


			callback();
		},

		flush( callback ) {
			if ( this._last ) {
				this.push( this._last );
			}

			callback();
		},
	});
}

export function importDB( site, file, opts, callback ) {

	// Default opts
	opts = Object.assign({
		throttle: 1, // 1 MB
		replace: {},
	}, opts );


	validateSQLFile( file, err => {
		if ( err && err.length ) {
			err.forEach( err => {
				console.error( 'Validation Error:', err.message );
			});

			return;
		}

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

			var sanitize = sanitizeSQLFile();
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

			for ( let from in opts.replace ) {
				let to = opts.replace[ from ];
				let replace = spawn( 'go-search-replace', [ from, to ], { stdio: ['pipe', 'pipe', process.stderr] });
				stream.pipe( replace.stdin );
				stream = replace.stdout;
			}

			sanitize.on( 'error', err => {
				console.error( '\n' + err.toString() );
				process.exit( 1 );
			});

			stream
				.pipe( sanitize )
				.pipe( throttle )
				.pipe( pv )
				.pipe( importdb.stdin );
		});
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
