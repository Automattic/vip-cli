#!/usr/bin/env node

/**
 * External dependencies
 */
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import API from '../lib/api';
import command from '../lib/cli/command';
import { mediaImportGetConfig } from '../lib/media-import/config';
import { trackEvent } from '../lib/tracker';
import {
	findNestedDirectories,
	folderStructureValidation,
	logErrorsForIntermediateImages,
	logErrorsForInvalidFileTypes,
	logErrorsForInvalidFilenames,
	summaryLogs,
	validateFiles,
} from '../lib/vip-import-validate-files';

const appQuery = `
	id,
	name,
	type,
	organization { id, name },
	environments{
		id
		appId
		type
		name
		primaryDomain { name }
	}
`;

command( {
	appContext: true,
	appQuery,
	envContext: true,
	module: 'import-media',
	requiredArgs: 1,
} )
	// .example( '@TTODO ADD EXAMPLE' )
	.argv( process.argv, async ( args, opts ) => {
		console.log( args );
		const { app, env, exportFileErrorsToJson, overwriteExistingFiles, importIntermediateImages } =
			opts;
		// const [ url ] = args;
		await trackEvent( 'import_validate_files_command_execute' );
		/**
		 * File manipulation
		 * @todo Add file manipulation to extract the folder name
		 *
		 * Manipulating the file path/name to extract the folder name
		 */
		// const folder = arg.join(); // File comes in as an array as part of the args- turn it into a string
		// arg = url.parse( folder ); // Then parse the file to its URL parts
		// const filePath = arg.path; // Extract the path of the file

		let folderValidation;

		const filePath = 'uploads'; // Temporary folder path for testing
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
		 * File extension validation
		 *
		 * Ensure that prohibited media file types are not used
		 */
		console.debug( 'FILES', files );
		// Get media import configuration
		const api = API();
		const mediaImportConfig = await mediaImportGetConfig( api, app.id, env.id );

		if ( ! mediaImportConfig ) {
			console.error( chalk.red( '✕ Error:' ), 'Media import configuration not available' );
			return;
		}

		// Collect invalid files for error logging
		const { intermediateImagesTotal, errorFileTypes, errorFileNames, intermediateImages } =
			await validateFiles( files, mediaImportConfig );

		/**
		 * Error logging
		 */
		if ( errorFileTypes.length > 0 ) {
			logErrorsForInvalidFileTypes( errorFileTypes, mediaImportConfig.allowedFileTypes );
		}

		if ( errorFileNames.length > 0 ) {
			logErrorsForInvalidFilenames( errorFileNames );
		}

		if ( Object.keys( intermediateImages ).length > 0 ) {
			logErrorsForIntermediateImages( intermediateImages );
		}

		// Log a summary of all errors
		summaryLogs( {
			folderErrorsLength: folderValidation.length,
			intImagesErrorsLength: intermediateImagesTotal,
			fileTypeErrorsLength: errorFileTypes.length,
			filenameErrorsLength: errorFileNames.length,
			totalFiles: files.length,
			totalFolders: nestedDirectories.length,
		} );

		// Tracks events to track activity
		// Props (object keys) need to be in Snake case vs. camelCase
		/* eslint-disable camelcase */
		const allErrors = {
			folder_errors_length: folderValidation.length,
			int_images_errors_length: intermediateImagesTotal,
			file_type_errors_length: errorFileTypes.length,
			filename_errors_length: errorFileNames.length,
			total_files: files.length,
			total_folders: nestedDirectories.length,
		};
		/* eslint-enable camelcase */

		await trackEvent( 'import_validate_files_command_success', allErrors );
	} );
