#!/usr/bin/env node

/**
 * External dependencies
 */
import chalk from 'chalk';
import url from 'url';

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import { getMediaImportConfig } from '../lib/media-import/config';
import { trackEvent } from '../lib/tracker';
import {
	findNestedDirectories,
	folderStructureValidation,
	isDirectory,
	summaryLogs,
	validateFiles,
	logErrors,
	ValidateFilesErrors,
} from '../lib/vip-import-validate-files';

export async function vipImportValidateFilesCmd( arg = [] ) {
	await trackEvent( 'import_validate_files_command_execute' );
	/**
	 * File manipulation
	 *
	 * Manipulating the file path/name to extract the folder name
	 */
	const folder = arg.join(); // File comes in as an array as part of the args- turn it into a string
	arg = url.parse( folder ); // Then parse the file to its URL parts
	const filePath = arg.path; // Extract the path of the file

	if ( ! ( await isDirectory( filePath ) ) ) {
		console.error(
			chalk.red( '✕ Error:' ),
			'The given path is not a directory, please provide a valid directory path.'
		);
		return;
	}

	let folderValidation = [];

	/**
	 * Folder structure validation
	 *
	 * Find nested directories and files to see if media files follow the WordPress recommended folder structure
	 *
	 * Recommended structure: `uploads/year/month` (Single sites)
	 */
	const nestedFiles = findNestedDirectories( filePath );

	// Terminates the command here if no nested files found
	if ( ! nestedFiles ) {
		return;
	}

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
	 * Get Media Import configuration
	 */
	const mediaImportConfig = await getMediaImportConfig();

	if ( ! mediaImportConfig ) {
		console.error(
			chalk.red( '✕ Error:' ),
			'Could not retrieve validation metadata. Please contact VIP Support.'
		);
		return;
	}

	/**
	 * File Validation
	 * Collect all errors from file validation
	 */
	const {
		intermediateImagesTotal,
		errorFileTypes,
		errorFileNames,
		errorFileSizes,
		errorFileNamesCharCount,
		intermediateImages,
	} = await validateFiles( files, mediaImportConfig );

	/**
	 * Error logging
	 * Not sure if the changes made to the error logging better
	 */
	logErrors( {
		errorType: ValidateFilesErrors.INVALID_TYPES,
		invalidFiles: errorFileTypes,
		limit: Object.keys( mediaImportConfig.allowedFileTypes ),
	} );
	logErrors( {
		errorType: ValidateFilesErrors.INVALID_SIZES,
		invalidFiles: errorFileSizes,
		limit: mediaImportConfig.fileSizeLimitInBytes,
	} );
	logErrors( {
		errorType: ValidateFilesErrors.INVALID_NAME_CHARACTER_COUNTS,
		invalidFiles: errorFileNamesCharCount,
		limit: mediaImportConfig.fileNameCharCount,
	} );
	logErrors( {
		errorType: ValidateFilesErrors.INVALID_NAMES,
		invalidFiles: errorFileNames,
	} );
	logErrors( {
		errorType: ValidateFilesErrors.INTERMEDIATE_IMAGES,
		invalidFiles: Object.keys( intermediateImages ),
		invalidFilesObj: intermediateImages,
	} );

	// Log a summary of all errors
	summaryLogs( {
		folderErrorsLength: folderValidation.length,
		intImagesErrorsLength: intermediateImagesTotal,
		fileTypeErrorsLength: errorFileTypes.length,
		fileErrorFileSizesLength: errorFileSizes.length,
		filenameErrorsLength: errorFileNames.length,
		fileNameCharCountErrorsLength: errorFileNamesCharCount.length,
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
}

command( { requiredArgs: 1, format: true } )
	.examples( [
		{
			usage: 'vip import validate-files <folder_name>',
			description: 'Run the import validation against the folder of media files',
		},
	] )
	.argv( process.argv, vipImportValidateFilesCmd );
