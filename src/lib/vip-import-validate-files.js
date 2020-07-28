// @flow

/**
 * External dependencies
 */
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

// Promisify to use async/await
const readDir = promisify( fs.readdir );

// Accepted media file extensions
export const acceptedExtensions = [
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

/** Nested Directory Search
 *
 * Use recursion to identify the nested tree structure of the folders
 * 
 * @param directory The root directory
 */
export const findNestedDirectories = async directory => {
	let dir, nestedDir;

	try {
		// Read what's inside the current directory
		dir = await readDir( directory );
		nestedDir = dir[ 0 ];

		// Once we hit individual media files, stop
		const regexExtension = /\.\w{3,4}$/;
		const mediaFiles = regexExtension.test( nestedDir );

		if ( dir !== undefined && mediaFiles ) {
			return directory;
		}
	} catch ( error ) {
		console.error( chalk.red( '✕' ), ` Error: Cannot read nested directory: ${ directory }. Reason: ${ error.message }` );
		return;
	}

	// Update the path with the current directory + nested directory
	const updatedPath = directory + '/' + nestedDir;

	// Use recursion to map out the file structure
	return await findNestedDirectories( updatedPath );
};

/** Character validation
 *
 * This logic is based on the WordPress core function `sanitize_file_name()`
 * https://developer.wordpress.org/reference/functions/sanitize_file_name/
 *
 * @param filename string - The current file being validated
 * @param returns Boolean - Checks if the filename has been sanitized
 */
export const sanitizeFileName = filename => {
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

	// Check if the filename has been sanitized
	const checkFile = sanitizedFile === filename;

	return checkFile;
};

/**
 * Intermediate images
 *
 * Identify intermediate images via regex. Should catch:
 *
 * panda4000x6000.jpg (sizing)
 * panda-4000x6000.jpg (dash)
 * panda_4000x6000.jpg (underscore)
 * panda 4000x6000.jpg (space)
 * panda_test-4000x6000@2x.jpg (retina display)
 *
 * @param filename The current file being validated
 * @param returns Array
 */
const identifyIntermediateImage = filename => {
	const regex = /(-|_)?(\d+x\d+)(@\d+\w)?(\.\w{3,4})$/;
	return filename.match( regex );
};

// Check if an intermediate image has an existing original (source) image
export const doesImageHaveExistingSource = ( file, folder ) => {
	const filename = path.basename( file );

	// Intermediate image regex check
	const intermediateImage = identifyIntermediateImage( filename );

	if ( null !== intermediateImage ) {
		const imageSizing = intermediateImage[ 0 ]; // First capture group of the regex validation
		const extension = path.extname( filename ).substr( 1 ); // Extension of the path (e.g.- `.jpg`)

		// Filename manipulation: if an image is an intermediate image, strip away the image sizing
		// e.g.- `panda4000x6000.png` -> `panda.png`
		const baseFileName = filename.replace( imageSizing, '' ) + '.' + extension;
		const originalImage = path.join( folder, baseFileName );

		// Check if an image with the same path + name (the original) already exists
		if ( fs.existsSync( originalImage ) ) {
			return originalImage;
		}
		return false;
	}
};

/** Recommendations
 *
 * Recommend alternatives to invalid folders or files
 */

// Recommend the WordPress year/month file structure for media files
export const recommendedFileStructure = () => {
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

/**
 * Error logging
 *
 * Log errors for invalid folders or files
 */

// Log errors for files with invalid file extensions and recommend accepted file types
export const logErrorsForInvalidFileTypes = invalidFiles => {
	invalidFiles.map( file => {
		console.error( chalk.red( '✕' ), `File extensions: Invalid file type for file: ${ file }` );
	} );

	console.log();
	recommendAcceptableFileTypes();
	console.log();
};

// Log errors for files with invalid filenames and show a list of accepted/prohibited chars
export const logErrorsForInvalidFilenames = invalidFiles => {
	invalidFiles.map( file => {
		console.log( chalk.red( '✕' ), `Character validation: Invalid filename for file: ${ file }` );
	} );

	console.log();
	recommendAcceptableFileNames();
	console.log();
};