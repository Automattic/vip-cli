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
import {
	acceptedExtensions,
	findNestedDirectories,
	folderStructureValidation,
	isFileSanitized,
	doesImageHaveExistingSource,
	logErrorsForIntermediateImages,
	logErrorsForInvalidFileTypes,
	logErrorsForInvalidFilenames,
	summaryLogs,
} from '../lib/vip-import-validate-files';
import { trackEvent } from 'lib/tracker';

// Promisify to use async/await
const syncStat = promisify( fs.statSync );
const stat = promisify( fs.stat );
const readDir = promisify( fs.readdir );

command( { requiredArgs: 1, format: true } )
	.example( 'vip import validate files <file>', 'Run the import validation against the file' )
	.argv( process.argv, async ( arg, options ) => {
		await trackEvent( 'import_validate_files_command_execute' );
		/**
		 * File manipulation
		 *
		 * Manipulating the file path/name to extract the folder name
		 */
		const folder = arg.join(); // File comes in as an array as part of the args- turn it into a string
		arg = url.parse( folder ); // Then parse the file to its URL parts
		const filePath = arg.path; // Extract the path of the file

		let folderValidation;

		/**
		 * Folder structure validation
		 *
		 * Find nested directories and files to see if media files follow the WordPress recommended folder structure
		 *
		 * Recommended structure: `uploads/year/month` (Single sites)
		 */
		const nestedFiles = findNestedDirectories( filePath );

		const { files, folderStructureObj } = nestedFiles; // Destructure

		// Check if there are any nested directories within the given folder
		const nestedDirectories = Object.keys( folderStructureObj );

		if ( nestedDirectories && nestedDirectories.length > 0 ) {
			folderValidation = folderStructureValidation( nestedDirectories );
		}

		/**
		 * Individual file validations
		 *
		 * - Media file extension/type validation
		 * - Filename validation
		 * - Intermediate image validation
		 */
		if ( ! files || ! files.length || files.length <= 0 ) {
			console.error( chalk.red( '✕ Error:' ), 'Media files directory cannot be empty' );
		}

		/**
		 * Media file extension validation
		 *
		 * Ensure that prohibited media file types are not used
		 */

		// Collect invalid files for error logging
		let intermediateImagesTotal = 0;

		const errorFileTypes = [];
		const errorFileNames = [];
		const intermediateImages = {};

		// Iterate through each file to isolate the extension name
		for ( const file of files ) {
			// Check if file is a directory
			const stats = await stat( file );
			const isFolder = stats.isDirectory();

			const extension = path.extname( file ); // Extract the extension of the file
			const ext = extension.substr( 1 ); // We only want the ext name minus the period (e.g- .jpg -> jpg)
			const extLowerCase = ext.toLowerCase(); // Change any uppercase extensions to lowercase

			// Check for any invalid file extensions
			// Returns true if ext is valid; false if invalid
			const validExtensions = acceptedExtensions.includes( extLowerCase );

			// Collect files that have no extension, have invalid extensions,
			// or are directories for error logging
			if ( ! extension || ! validExtensions || isFolder ) {
				errorFileTypes.push( file );
			}

			/**
			 * Filename validation
			 *
			 * Ensure that filenames don't contain prohibited characters
			 */

			// Collect files that have invalid file names for error logging
			if ( isFileSanitized( file ) ) {
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
			const original = doesImageHaveExistingSource( file );

			// If an image is an intermediate image, increment the total number and
			// populate key/value pairs of the original image and intermediate image(s)
			if ( original ) {
				intermediateImagesTotal++;

				if ( intermediateImages[ original ] ) {
					// Key: original image, value: intermediate image(s)
					intermediateImages[ original ] = `${ intermediateImages[ original ] }, ${ file }`;
				} else {
					intermediateImages[ original ] = file;
				}
			}
		}

		/**
		 * Error logging
		 */
		if ( errorFileTypes.length > 0 ) {
			logErrorsForInvalidFileTypes( errorFileTypes );
		}

		if ( errorFileNames.length > 0 ) {
			logErrorsForInvalidFilenames( errorFileNames );
		}

		if ( Object.keys( intermediateImages ).length > 0 ) {
			logErrorsForIntermediateImages( intermediateImages );
		}

		const allErrors = {
			folderErrorsLength: folderValidation.length,
			intImagesErrorsLength: intermediateImagesTotal,
			fileTypeErrorsLength: errorFileTypes.length,
			filenameErrorsLength: errorFileNames.length,
			totalFiles: files.length,
			totalFolders: nestedDirectories.length,
		};

		// Log a summary of all errors
		summaryLogs( allErrors );

		await trackEvent( 'import_validate_files_command_success', allErrors );
	} );
