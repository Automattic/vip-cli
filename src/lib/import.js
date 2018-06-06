const async = require( 'async' );
const path = require( 'path' );
const request  = require( 'superagent' );
const progress = require( 'progress' );

// Ours
const constants = require( '../constants' );
const MAX_IMPORT_FILE_SIZE = 1024 * 1024 * 1024; // 1GB

export class Importer {
	constructor( opts, done ) {
		opts = Object.assign({
			checkExists: true,
			concurrency: 5,
			dryRun: false,
			intermediate: false,
			types: default_types,
		}, opts );

		if ( ! opts.site || ! opts.site.client_site_id ) {
			throw new Error( 'Invalid VIP Go site' );
		}

		if ( ! opts.token ) {
			throw new Error( 'Invalid VIP Go Files Service token' );
		}

		this.site = opts.site;
		this.token = opts.token;

		this.importer( opts, done );
	}

	importer( opts, done ) {
		let count = 0;

		// Set up the consumer queue
		this.consumerQ = async.queue( ( file, callback ) => {
			if ( ++count % 1000 === 0 ){
				console.log( count );
			}

			const filename = path.basename( file );

			// Check extension
			let ext = path.extname( filename ).substr( 1 );
			if ( ! ext || opts.types.indexOf( ext.toLowerCase() ) < 0 ) {
				let err = new Error( 'Invalid extension: ' + filename );
				console.log( err.toString() );
				return callback( err );
			}

			// Check filename
			if ( ! this.validateFileName( filename ) ) {
				const sanitized = this.sanitizeFileName( filename );
				const err = new Error( `Invalid filename: ${ filename } -> ${ sanitized }`  );
				console.log( err.toString() );
				return callback( err );
			}

			// Check intermediate image
			let int_re = /-\d+x\d+(\.\w{3,4})$/;
			if ( ! opts.intermediate && int_re.test( filename ) ) {
				// TODO Check if the original file exists
				let err = new Error( 'Skipping intermediate image: ' + file );
				console.log( err.toString() );
				return callback( err );
			}

			if ( opts.dryRun ) {
				return callback();
			}

			this.fileExists( file, !opts.checkExists, err => {
				if ( err ) {
					return callback( err );
				}

				return this.consumer( file, callback );
			});
		}, opts.concurrency );

		this.consumerQ.error = err => {
			console.log( 'Consumer Error:', err.toString() );
		};

		// Set up the producer queue (populates consumer queue)
		this.producerQ = async.queue( ( ptr, callback ) => {
			return this.producer( ptr, err => {
				if ( this.consumerQ.length() > this.consumerQ.concurrency * 100 ) {
					this.producerQ.pause();
				}

				callback( err );
			});
		}, 1 );

		this.producerQ.error = err => {
			console.log( 'Producer Error:', err.toString() );
		};

		// Start filling consumer queue when there are less than 25x concurrency number of items
		this.consumerQ.buffer = this.consumerQ.concurrency * 25;
		this.consumerQ.unsaturated = this.consumerQ.empty = () => {
			this.producerQ.resume();
		};

		// When both queues are empty, run the done callback
		let locked = false;
		this.consumerQ.drain = this.producerQ.drain = () => {
			if ( done && !locked && this.consumerQ.idle() && this.producerQ.idle() ) {
				locked = true;
				done( count );
			}
		};
	}

	start() {
		// kick it off
		this.producerQ.push( null );
	}

	setProducer( producer ) {
		this.producer = producer;
	}

	setConsumer( consumer ) {
		this.consumer = consumer;
	}

	queuePtr( ptr ) {
		this.producerQ.push( ptr );
	}

	queueFile( item ) {
		this.consumerQ.push( item );
	}

	fileExists( path, skip, callback ) {
		if ( skip ) {
			return callback();
		}

		let filepath = path.split( 'uploads' );
		request
			.get( encodeURI( 'https://' + constants.FILES_SERVICE_ENDPOINT + '/wp-content/uploads' + filepath[1] ) )
			.set({ 'X-Client-Site-ID': this.site.client_site_id })
			.set({ 'X-Access-Token': this.token })
			.set({ 'X-Action': 'file_exists' })
			.timeout( 1000 )
			.end( err => {
				if ( err && err.status === 404 ) {
					return callback();
				} else if ( err ) {
					return callback( err );
				} else {
					return callback( new Error( 'File already exists' ) );
				}
			});
	}

	upload( path ) {
		let filepath = path.split( 'uploads' );
		return request
			.put( encodeURI( 'https://' + constants.FILES_SERVICE_ENDPOINT + '/wp-content/uploads' + filepath[1] ) )
			.set({ 'X-Client-Site-ID': this.site.client_site_id })
			.set({ 'X-Access-Token': this.token })
			.timeout( 10000 );
	}

	sanitizeFileName( file ) {
		// This logic is based on the WordPress core function `sanitize_file_name()`
		// https://developer.wordpress.org/reference/functions/sanitize_file_name/

		// Unicode space
		file = file.replace( '\u00A0', ' ' );

		// Special chars
		[ '?','[',']','/','\\','=','<','>',':',';',',','\'','\"','&','$','#','*','(',')','|','~','`','!','{','}','%','+' ]
			.forEach( c => file = file.replace( c, '' ) );

		[ '%20', '+' ].forEach( c => file = file.replace( c, '-' ) );
		file = file.replace( /\s+/, '-' );
		file = file.replace( /(?:^[\.\-_])|(?:[\.\-_]$)/g, '' );

		return file;
	}

	validateFileName( file ) {
		return this.sanitizeFileName( file ) === file;
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
