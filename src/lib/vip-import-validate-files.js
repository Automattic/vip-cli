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

/** Recommendations
 *
 * Recommend alternatives to invalid folders or files
 */

// Recommend the WordPress year/month file structure for media files
const recommendedFileStructure = () => {
	console.log(
		chalk.underline( 'We recommend the WordPress default folder structure for your media files: \n\n' ) +
		chalk.underline( 'Single sites:' ) +
		chalk.yellow( ' `uploads/year/month/image.png` \n' ) +
		' e.g.-' + chalk.yellow( '`uploads/2020/06/image.png` \n' ) +
		chalk.underline( 'Multisites:' ) +
		chalk.cyan( ' `uploads/sites/siteID/year/month/image.png` \n' ) +
		' e.g.-' + chalk.cyan( '`uploads/sites/5/2020/06/images.png` \n' )
	);
	console.log( '-------------------------------------------------------' );
};

// Recommend accepted file types
const recommendAcceptableFileTypes = () => {
	console.log(
		'Accepted file types: \n\n' +
		chalk.magenta( `${ acceptedExtensions }` )
	);
	console.log();

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
	console.log();
};

/** Nested Directory Search
 *
 * Use recursion to identify the nested tree structure of the folders
 *
 * @param {string} directory Root directory, or the current directory
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
	return findNestedDirectories( updatedPath );
};

/**
 * Folder structure validation
 *
 * - Uploads directory validation
 * - Year & month directory validation
 *
 * Check if the folder structure follows the WordPress recommended `uploads/year/month`
 * folder path structure for media files
 *
 * @param {string} folderStructure Path of the entire folder structure
 */
export const folderStructureValidation = folderStructure => {
	let errors = 0;
	let yearIndex, monthIndex;

	// Turn the path into an array to determine index position
	const directories = folderStructure.split( '/' );

	/**
	 * Upload folder validation
	 *
	 * Find if an `uploads` folder exists and return its index position
	 */
	const uploadsIndex = directories.indexOf( 'uploads' );

	/**
	 * Year folder validation
	 *
	 * Find if a year folder exists via a four digit regex matching pattern,
	 * then obtain that value
	 */
	const regexYear = /\b\d{4}\b/g;
	const year = regexYear.exec( folderStructure ); // Returns an array with the regex-matching value

	if ( year ) {
		yearIndex = directories.indexOf( year[ 0 ] );
	}

	/**
	 * Month folder validation
	 *
	 * Find if a month folder exists via a two digit regex matching pattern,
	 * then obtain that value
	 */
	const regexMonth = /\b\d{2}\b/g;
	const month = regexMonth.exec( folderStructure ); // Returns an array with the regex-matching value

	if ( month ) {
		monthIndex = directories.indexOf( month[ 0 ] );
	}

	/**
	 * Logging
	 */

	// Uploads folder
	if ( uploadsIndex === 0 ) {
		console.log();
		console.log( '✅ File structure: Uploads directory exists' );
		console.log();
	} else {
		console.log();
		console.log( chalk.yellow( '✕' ), 'Recommended: Media files should reside in an', chalk.magenta( '`uploads`' ), 'directory' );
		errors++;
	}

	// Year folder
	if ( yearIndex && yearIndex === 1 ) {
		console.log( '✅ File structure: Year directory exists (format: YYYY)' );
		console.log();
	} else {
		console.log( chalk.yellow( '✕' ), 'Recommended: Structure your WordPress media files into', chalk.magenta( '`uploads/YYYY`' ), 'directories' );
		errors++;
	}

	// Month folder
	if ( monthIndex && monthIndex === 2 ) {
		console.log( '✅ File structure: Month directory exists (format: MM)' );
		console.log();
		console.log( '-------------------------------------------------------' );
	} else {
		console.log( chalk.yellow( '✕' ), 'Recommended: Structure your WordPress media files into', chalk.magenta( '`uploads/YYYY/MM`' ), 'directories' );
		console.log();
		errors++;
	}

	if ( errors ) {
		recommendedFileStructure();
	}

	return;
};

/** Character validation
 *
 * This logic is based on the WordPress core function `sanitize_file_name()`
 * https://developer.wordpress.org/reference/functions/sanitize_file_name/
 *
 * @param {string} filename - The current file being validated
 * @returns {Boolean} - Checks if the filename has been sanitized
 */
export const isFileSanitized = filename => {
	let sanitizedFile = filename;

	// Prohibited characters:
	// Encoded spaces (%20), no-break spaces - keeps words together (\u00A0), and plus signs
	const regexSpaces = /\u00A0|(%20)|\+/g;
	sanitizedFile = sanitizedFile.replace( regexSpaces, ' ' );

	// Prohibited characters:
	// Special characters: + & # % = ' " \ < > : ; , / ? $ * | ` ! { }
	const regexSpecialChars = /[\/\'\"\\=<>:;,&?$#*|`!+{}%]/g;
	sanitizedFile = sanitizedFile.replace( regexSpecialChars, '' );

	// No dashes, underscores, or periods allowed as the first
	// or last letter of the file (including the extension)
	const regexFirstAndLast = /(?:^[\.\-_])|(?:[\.\-_]$)/g;
	sanitizedFile = sanitizedFile.replace( regexFirstAndLast, '' );

	// Check if the filename has been sanitized
	const checkFile = sanitizedFile !== filename;

	return checkFile;
};

/**
 * Intermediate image validation
 *
 * Identify intermediate images via regex. Should catch:
 *
 * panda4000x6000.jpg (sizing)
 * panda-4000x6000.jpg (dash)
 * panda_4000x6000.jpg (underscore)
 * panda 4000x6000.jpg (space)
 * panda_test-4000x6000@2x.jpg (retina display)
 *
 * @param {string} filename The current file being validated
 * @returns {Array} Returns an array of the matching regex characters
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
	console.log( '-------------------------------------------------------' );
	console.log();
};

// Log errors for files with invalid filenames and show a list of accepted/prohibited chars
export const logErrorsForInvalidFilenames = invalidFiles => {
	invalidFiles.map( file => {
		console.log( chalk.red( '✕' ), `Character validation: Invalid filename for file: ${ file }` );
	} );

	console.log();
	recommendAcceptableFileNames();
	console.log( '-------------------------------------------------------' );
	console.log();
};
