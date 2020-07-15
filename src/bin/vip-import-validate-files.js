#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
import url from 'url';
import path from 'path';
import chalk from 'chalk';
import fs from 'fs';
import { promisify } from 'util';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';

// Promisify to use async/await
const readDir = promisify( fs.readdir );

// Accepted media file extensions
const acceptedExtensions = [
	'jpg', 'jpeg', 'jpe',
	'gif',
	'png',
	'bmp',
	'tiff', 'tif',
	'ico',
	'asf',
	'asx',
	'wmv', 'wmx', 'wm',
	'avi',
	'divx',
	'mov',
	'qt',
	'mpeg', 'mpg', 'mpe', 'mp4', 'm4v',
	'ogv',
	'webm',
	'mkv',
	'3gp', '3gpp', '3g2', '3gp2',
	'txt',
	'asc',
	'c', 'cc', 'h',
	'srt',
	'csv', 'tsv',
	'ics',
	'rtx',
	'css',
	'vtt',
	'dfxp',
	'mp3',
	'm4a', 'm4b',
	'ra',
	'ram',
	'wav',
	'ogg',
	'oga',
	'mid', 'midi',
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
	'xla', 'xls', 'xlt', 'xlw',
	'mdb', 'mpp',
	'docx', 'docm', 'dotx', 'dotm',
	'xlsx', 'xlsm', 'xlsb', 'xltx', 'xltm', 'xlam',
	'pptx', 'pptm', 'ppsx', 'ppsm', 'potx', 'potm', 'ppam',
	'sldx', 'sldm',
	'onetoc', ' onetoc2', 'onetmp', 'onepkg', 'oxps',
	'xps',
	'odt', 'odp', 'ods', 'odg', 'odc', 'odb', 'odf',
	'wp', 'wpd',
	'key', 'numbers', 'pages',
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
				chalk.underline( 'Single sites:' ) +
				chalk.yellow( ' `uploads/year/month/image.png` \n' ) +
				' e.g.-' + chalk.yellow( '`uploads/2020/06/image.png` \n' ) +
				chalk.underline( 'Multisites:' ) +
				chalk.cyan( ' `uploads/sites/siteID/year/month/image.png` \n' ) +
				' e.g.-' + chalk.cyan( '`uploads/sites/5/2020/06/images.png` \n' )
			);
		};

		/* Find nested directories using recursion to validate the folder structure
		*/
		const findNestedDirectories = async directory => {
			let dir, nestedDir;

			try {		
				// Read what's inside the current directory		
				dir = await readDir( directory );

				nestedDir = dir[ 0 ]

				// Once we hit individual media files, stop
                const regexExtension = /\.\w{3,4}$/;
				const mediaFiles = regexExtension.test( nestedDir );

				if ( dir !== undefined && mediaFiles ) {
					return directory;
				}
			} catch ( error ) {
				console.error( chalk.red( '✕' ), ` Error: Unable to read directory: ${ directory }. Reason: ${ error.message }` );
			}

			// Update the path with the current directory + nested directory
			const updatedPath = directory + '/' + nestedDir

			// Use recursion to map out the file structure
			return await findNestedDirectories( updatedPath );
		}

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
				console.error( chalk.red( '✕ Error:' ), 'Media files directory cannot be empty' );
			}

			const regex = /\b\d{4}\b/g;
			const yearFolder = files.filter( directory => regex.test( directory ) );

			if ( files && yearFolder && yearFolder.length === 1 ) {
				console.log( '✅ File structure: Year directory exists (format: YYYY)' );
			} else {
				console.error( chalk.red( '✕' ), 'Error: Media files must be in an `uploads/YYYY` directory' );
				console.log();
				recommendedFileStructure();
			}

			// Collect files that have invalid file types (extensions) or filenames
			const errorFileTypes = [];
			const errorFileNames = [];

			/* Media file extension validation */
			// Map through each file to isolate the extension name
			files.map( file => {
				const extension = path.extname( file ); // Extract the extension of the file
				const ext = extension.substr( 1 ); // We only want the ext name minus the period (e.g - .jpg -> jpg)
				const extLowerCase = ext.toLowerCase(); // Change any uppercase extensions to lowercase

				// Check for any invalid file extensions
				// Returns true if ext is invalid; false if valid
				const invalidExtensions = acceptedExtensions.indexOf( extLowerCase ) < 0;

				// Collect files that have no extension, or has an invalid extension to log errors later
				if ( ! extension || invalidExtensions ) {
					errorFileTypes.push( file );
				}

				/* Character validation
				* This logic is based on the WordPress core function `sanitize_file_name()`
				* https://developer.wordpress.org/reference/functions/sanitize_file_name/
				*/
				const sanitizeFileName = filename => {
					let sanitizedFile;

					// Prohibited characters:
					// Encoded spaces (%20), no-break spaces - keeps words together (\u00A0), and plus signs
					const regexSpaces = /\u00A0|(%20)|\+/g;
					sanitizedFile = filename.replace( regexSpaces, ' ' );

					// Prohibited characters:
					// Special characters: + & # % = ' " \ < > : ; , / ? $ * | ` ! { }
					const regexSpecialChars = /[\/\'\"\\=<>:;,&?$#*|`!+{}%]/g;
					sanitizedFile = filename.replace( regexSpecialChars, '' );

					// No dashes, underscores, or periods allowed as the first
					// or last letter of the file (including the extension)
					const regexFirstAndLast = /(?:^[\.\-_])|(?:[\.\-_]$)/g;
					sanitizedFile = filename.replace( regexFirstAndLast, '' );

					// // Check if the file name has been sanitized
					const checkFile = sanitizedFile === filename;

					return checkFile;
				};

				// Collect files that have invalid file names to log errors later
				if ( ! sanitizeFileName( file ) ) {
					errorFileNames.push( file );
				}
			} );

			// Recommend accepted file types
			const recommendAcceptableFileTypes = () => {
				console.log(
					'Accepted file types: \n\n' +
					chalk.magenta( `${ acceptedExtensions }` )
				);
			};

			// Accepted file name characters
			const recommendAcceptableFileNames = () => {
				const prohibitedCharacters = '+ & # % = \' \" \ < > : ; , / ? $ * | ` ! { }';
				const acceptedCharacters = 'Non-English characters, spaces, ( ) [ ] ~';

				console.log(
					'The following characters are allowed in file names:\n' +
					chalk.green( `${ acceptedCharacters }` ) + '\n\n' +
					'The following characters are prohibited in file names:\n' +
					chalk.red( `${ prohibitedCharacters }` )
				);
			};

			// Log errors for files with invalid file extensions and recommend accepted file types
			const logErrorsForInvalidFileTypes = invalidFiles => {
				invalidFiles.map( file => {
					console.error( chalk.red( '✕' ), `File extensions: Invalid file type for file: ${ file }` );
				} );

				console.log();
				recommendAcceptableFileTypes();
				console.log();
			};

			// Log errors for files with invalid filenames and show a list of accepted/prohibited chars
			const logErrorsForInvalidFilenames = invalidFiles => {
				invalidFiles.map( file => {
					console.log( chalk.red( '✕' ), `Character validation: Invalid filename for file: ${ file }` );
				} );

				console.log();
				recommendAcceptableFileNames();
				console.log();
			};

			if ( errorFileTypes.length > 0 ) {
				logErrorsForInvalidFileTypes( errorFileTypes );
			}

			if ( errorFileNames.length > 0 ) {
				logErrorsForInvalidFilenames( errorFileNames );
			}
		} );
	} );
