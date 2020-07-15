#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
import url from 'url';
import path from 'path';
import chalk from 'chalk';
import fs from 'fs';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';

// Accepted media file extensions
const acceptedExtensions = [
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

command( { requiredArgs: 1, format: true } )
	.example( 'vip import validate files <file>', 'Validate your media files' )
	.argv( process.argv, async ( arg, options ) => {
		// File comes in as an array as part of the args- turn it into a string
		const folder = arg.join();

		// Then parse the file to its URL parts
		arg = url.parse( folder );
		
		// Extract the path of the file
		const filePath = arg.path;

		const recommendedFileStructure = () => {
			console.log(
				'Please follow this structure for your media files: \n\n' +
				chalk.underline( 'Single sites:') +
				chalk.yellow(' `uploads/year/month/image.png` \n') +
				' e.g.-' + chalk.yellow('`uploads/2020/06/image.png` \n') +
				chalk.underline('Multisites:') +
				chalk.cyan(' `uploads/sites/siteID/year/month/image.png` \n') +
				' e.g.-' + chalk.cyan('`uploads/sites/5/2020/06/images.png` \n')
			);
		};

		// Ensure media files are stored in an `uploads` directory
		if ( folder.search( 'uploads' ) === -1 ) {
			console.error( chalk.red( '✕' ), 'Error: Media files must be in an `uploads` directory' );
			console.log();
			recommendedFileStructure();
		} else {
			console.log( '✅ File structure: Uploads directory exists' );
		}

		// Folder structure validation
		fs.readdir( folder, ( error, files ) => {
			if ( error ) {
				console.error( chalk.red( '✕ Error:' ), `Unable to read directory ${ folder }: ${ error.message }` );
			}

			if ( ! files.length || files.length <= 0 ) {
				console.error(chalk.red( '✕ Error:' ), 'Media files directory cannot be empty' );
			}

			const regex = /\b\d{4}\b/g;
			const yearFolder = files.filter( folder => regex.test( folder ) );
		
			if ( files && yearFolder && yearFolder.length === 1 ) {
				console.log('✅ File structure: Year directory exists (format: YYYY)');
			} else {
				console.error( chalk.red( '✕' ), 'Error: Media files must be in an `uploads/YYYY` directory' );
				console.log();
				recommendedFileStructure();
			}

			/* Media file extension validation */
			// Map through each file to isolate the extension name
			files.map( file => {
				const extension = path.extname( file ); // Extract the extension of the file
				const ext = extension.substr( 1 ); // We only want the ext name minus the period (e.g - .jpg -> jpg)
				const extLowerCase = ext.toLowerCase(); // Change any uppercase extensions to lowercase

				// Check for any invalid file extensions
				// Returns true if ext is invalid; false if valid
				const invalidExtensions = acceptedExtensions.indexOf( extLowerCase) < 0;
				
				// Recommend accepted file types
				const recommendAcceptableFileTypes = () => {
					console.log(
						'Accepted file types: \n\n' +
						chalk.magenta( `${ acceptedExtensions }` )
					);
				};

				// If a file has no extension, or has an invalid extension,
				// log an error and recommend alternative extension types
				if ( ! extension ||  invalidExtensions ) {
					console.error( chalk.red( '✕' ), `Error: Invalid file type for file: ${ file }` );
					console.log();
					recommendAcceptableFileTypes();
				}

				/* Character validation
				* This logic is based on the WordPress core function `sanitize_file_name()`
				* https://developer.wordpress.org/reference/functions/sanitize_file_name/
				*/
				const sanitizeFileName = file => {
					let sanitizedFile;

					// Prohibited characters:
					// Encoded spaces (%20), no-break spaces - keeps words together (\u00A0), and plus signs
					const regexSpaces = /\u00A0|(%20)|\+/g;
					sanitizedFile = file.replace( regexSpaces, ' ' )
			
					// Prohibited characters:
					// Special characters: + & # % = ' " \ < > : ; , / ? $ * | ` ! { }
					const regexSpecialChars = /[\/\'\"\\=<>:;,&?$#*|`!+{}%]/g;
					sanitizedFile= file.replace( regexSpecialChars, '' );
			
					// No dashes, underscores, or periods allowed as the first
					// or last letter of the file (including the extension)
					const regexFirstAndLast = /(?:^[\.\-_])|(?:[\.\-_]$)/g;
					sanitizedFile = file.replace( regexFirstAndLast, '' );

					// // Check if the file name has been sanitized
					const checkFile = sanitizedFile === file;
					
					return checkFile;
				}
			} )
		} )
	} );