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
import { 
	acceptedExtensions,
	findNestedDirectories,
	sanitizeFileName,
	doesImageHaveExistingSource,
	recommendedFileStructure,
	logErrorsForInvalidFileTypes,
	logErrorsForInvalidFilenames 
} from '../lib/vip-import-validate-files';

command( { requiredArgs: 1, format: true } )
	.example( 'vip import validate files <file>', 'Validate your media files' )
	.argv( process.argv, async ( arg, options ) => {
		// File comes in as an array as part of the args- turn it into a string
		const folder = arg.join();

		// Then parse the file to its URL parts
		arg = url.parse( folder );

		// Extract the path of the file
		const filePath = arg.path;

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

				// Collect files that have invalid file names to log errors later
				if ( ! sanitizeFileName( file ) ) {
					errorFileNames.push( file );
				}

				/**
				 * Intermediate image validation
				 * 
				 * Detect any intermediate images.
				 * 
				 * Intermediate images are copies of images that are resized, so you may have multiples of the same image.
				 * You can resize an image directly on VIP so intermediate images are not necessary.
				 */
				const original = doesImageHaveExistingSource( file, folder );

				if ( original ) {
					console.log(
						chalk.red( '✕' ),
						`Intermediate images: Duplicate files found for: ${ file }\n` +
						'Original file: ' + chalk.blue( `${ original }\n` ) +
						'Intermediate images: ' + chalk.cyan( `${ file }` )
					);
					console.log();
				}
			} );

			if ( errorFileTypes.length > 0 ) {
				logErrorsForInvalidFileTypes( errorFileTypes );
			}

			if ( errorFileNames.length > 0 ) {
				logErrorsForInvalidFilenames( errorFileNames );
			}
		} );
	} );
