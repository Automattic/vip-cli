const async = require( 'async' );
const path = require( 'path' );
const https = require( 'https' );
const concat = require( 'concat-stream' );
const request  = require( 'superagent' );

// Ours
const constants = require( '../constants' );
const MAX_IMPORT_FILE_SIZE = 1024 * 1024 * 1024; // 1GB

export function importer( producer, consumer, opts, done ) {
	opts = Object.assign({
		concurrency: 5,
		types: default_types,
		intermediate: false,
		dryRun: false,
	}, opts );

	if ( opts.dryRun ) {
		console.log( 'Dry Run\n=======' );
	}

	if ( ! opts.site ) {
		return done( new Error( 'Missing site reference' ) );
	}

	if ( ! opts.token ) {
		return done( new Error( 'Missing files service token' ) );
	}

	let q = async.priorityQueue( ( file, callback ) => {
		if ( file.init || file.ptr ) {
			return producer( file.ptr || null, q, callback );
		} else if ( file.path ) {
			file = file.path;

			// Check extension
			let ext = path.extname( file ).substr( 1 );
			if ( ! ext || opts.types.indexOf( ext.toLowerCase() ) < 0 ) {
				console.error( 'Invalid extension: ' + file );
				return callback( new Error( 'Invalid extension: ' + file ) );
			}

			// Check filename
			if ( ! /^[a-zA-Z0-9\/\._-]+$/.test( file ) ) {
				console.error( 'Invalid filename: ' + file );
				return callback( new Error( 'Invalid filename:' + file ) );
			}

			// Check intermediate image
			let int_re = /-\d+x\d+(\.\w{3,4})$/;
			if ( ! opts.intermediate && int_re.test( file ) ) {
				// TODO Check if the original file exists
				console.error( 'Skipping intermediate image: ' + file );
				return callback( new Error( 'Skipping intermediate image: ' + file ) );
			}

			return consumer( file, ( err, stream, path ) => {
				if ( err ) {
					return callback( err );
				}

				console.log( file );

				if ( opts.dryRun ) {
					return callback();
				}

				upload( stream, path, opts.site, opts.token, {}, err => {
					if ( err ) {
						console.error( err.toString() );
					}

					callback( err );
				});
			});
		} else {
			return callback( new Error( 'Unknown object type' ) );
		}
	}, opts.concurrency );

	// Kick off the importer
	q.push({ init: true }, 1 );

	if ( done ) {
		q.drain = function() {
			if ( q.workersList().length <= 0 ) {
				// Queue is empty and all workers finished
				done();
			}
		};
	}
}

function upload( stream, path, site, token, opts, callback ) {
	opts = Object.assign({
		checkExists: true,
	}, opts );

	if ( ! token ) {
		return callback( new Error( 'Missing files service token' ) );
	}

	let filepath = path.split( 'uploads' );

	if ( opts.checkExists ) {
		request
			.get( encodeURI( 'https://' + constants.FILES_SERVICE_ENDPOINT + '/wp-content/uploads' + filepath[1] ) )
			.set({ 'X-Client-Site-ID': site.client_site_id })
			.set({ 'X-Access-Token': token })
			.set({ 'X-Action': 'file_exists' })
			.timeout( 1000 )
			.end( err => {
				if ( err && err.status === 404 ) {
					opts.checkExists = false;
					return upload( stream, path, site, token, opts, callback );
				}

				return callback( err );
			});
	} else {
		stream.on( 'error', callback );
		stream.pipe( concat( data => {
			if ( Buffer.byteLength( data ) > MAX_IMPORT_FILE_SIZE ) {
				return callback( new Error( 'File exceeded max file size: ' + path ) );
			}

			let req = https.request({
				hostname: constants.FILES_SERVICE_ENDPOINT,
				method: 'PUT',
				path: encodeURI( '/wp-content/uploads' + filepath[1] ),
				headers: {
					'X-Client-Site-ID': site.client_site_id,
					'X-Access-Token': token,
				},
			}, callback );

			req.on( 'socket', socket => {
				socket.setTimeout( 10000 );
				socket.on( 'timeout', () => {
					req.abort();
				});
			});

			req.write( data );
			req.end();
		}) );
	}
}

export const default_types = [
	'jpg','jpeg','jpe',
	'gif',
	'png',
	'bmp',
	'tiff','tif',
	'ico',
	'asf',
	'asx',
	'wmv','wmx','wm',
	'avi',
	'divx',
	'mov',
	'qt',
	'mpeg','mpg','mpe','mp4','m4v',
	'ogv',
	'webm',
	'mkv',
	'3gp','3gpp','3g2','3gp2',
	'txt',
	'asc',
	'c','cc','h',
	'srt',
	'csv','tsv',
	'ics',
	'rtx',
	'css',
	'vtt',
	'dfxp',
	'mp3',
	'm4a','m4b',
	'ra',
	'ram',
	'wav',
	'ogg',
	'oga',
	'mid','midi',
	'wma',
	'wax',
	'mka',
	'rtf',
	'js',
	'pdf',
	'class',
	'psd',
	'xcf',
	'doc',
	'pot',
	'pps',
	'ppt',
	'wri',
	'xla','xls','xlt','xlw',
	'mdb','mpp',
	'docx','docm','dotx','dotm',
	'xlsx','xlsm','xlsb','xltx','xltm','xlam',
	'pptx','pptm','ppsx','ppsm','potx','potm','ppam',
	'sldx','sldm',
	'onetoc','onetoc2','onetmp','onepkg','oxps',
	'xps',
	'odt','odp','ods','odg','odc','odb','odf',
	'wp','wpd',
	'key','numbers','pages',
];


