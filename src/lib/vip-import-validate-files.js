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

/**
	* Character validation global variables
 *
 * Accepted and prohibited characters for filenames
 */

// Accepted characters in filenames
const acceptedCharacters = [ 'Non-English characters', 'spaces', '(', ')', '[', ']', '~' ];
const acceptedCharactersSet = new Set( acceptedCharacters ); // Prevent duplicates with a Set

// Prohibited characters in filenames
const prohibitedCharacters = [
	'+', '&', '#', '%', '=', '\'', '\"', '\\', '<', '>', ':', ';', ',', '/', '?', '$', '*', '|', '`', '!', '{', '}',
];
const prohibitedCharactersSet = new Set( prohibitedCharacters );

// Regex for prohibited characters
const regexSpecialChars = /[\/\'\"\\=<>:;,&?$#*|`!+{}%]/g;

/**
	* Recommendations
 *
 * Recommend alternatives to invalid folders or files
 */

// Recommend the WordPress year/month file structure for media files
const recommendedFileStructure = () => {
	console.log(
		chalk.underline( 'We recommend the WordPress default folder structure for your media files: \n\n' ) +
		chalk.underline( 'Single sites:' ) +
		chalk.yellow( '`uploads/year/month/image.png`\n' ) +
		' e.g.-' + chalk.yellow( '`uploads/2020/06/image.png`\n' ) +
		chalk.underline( 'Multisites:' ) +
		chalk.cyan( '`uploads/sites/siteID/year/month/image.png`\n' ) +
		' e.g.-' + chalk.cyan( '`uploads/sites/5/2020/06/images.png`\n' )
	);
	console.log( '------------------------------------------------------------' );
	console.log();
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
	// const acceptedCharacters = 'Non-English characters, spaces, ( ) [ ] ~';
	const allowedCharacters = [ ...acceptedCharactersSet ].join( ' ' );
	const notAllowedCharacters = [ ...prohibitedCharactersSet ].join( ' ' );

	console.log(
		'The following characters are allowed in file names:\n' +
		chalk.green( `${ allowedCharacters }\n\n` ) +
		'The following characters are prohibited in file names:\n' +
		chalk.red( `${ notAllowedCharacters }\n` )
	);
};

/**
	* Nested Directory Search
 *
 * Use recursion to identify the nested tree structure of the given media file
	* 
	* Example media file:
	*  - Given directory: uploads
	*   - Nested directories: 2020, 2019, 2018, 2017
	*    - Nested directories: 01, 02, 03, 04, 05, 06
	*     - Individual files: image.jpg, image2.jpg, etc. 
 *
 * @param {string} directory Root directory, or the given (current) directory
 */
let files = [];
let folderStructureObj = {};

export const findNestedDirectories = directory => {
	let nestedDirectories;

	try {
		// Read nested directories within the given directory
		nestedDirectories = fs.readdirSync( directory );

		// Filter out hidden files such as .DS_Store
		nestedDirectories = nestedDirectories.filter( file => ! ( /(^|\/)\.[^\/\.]/g ).test( file ) );

		nestedDirectories.forEach( dir => {
			// Concatenate the file path of the parent directory with the nested directory
			const filePath = path.join( directory, dir );
			const statSync = fs.statSync( filePath ); // Get stats on the file/folder

			// Keep looking for nested directories until we hit individual files
			if ( statSync.isDirectory() ) {
				return findNestedDirectories( filePath );
			} else {
				// Once we hit media files, add the path of all existing folders
				// as object keys to validate folder structure later on
				folderStructureObj[ directory ] = true;

				// Also, push individual files to an array to do individual file validations later on
				return files.push( filePath ); 
			}
		} );
	} catch ( error ) {
		console.error( chalk.red( '✕' ), ` Error: Cannot read nested directory: ${ directory }. Reason: ${ error.message }` );
		return;
	}

	return { files, folderStructureObj };
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
 * @param {Array} folderStructureKeys Path of the entire folder structure
 */
export const folderStructureValidation = folderStructureKeys => {
	let errors = 0;

	// Loop through each key (path) to validate the folder structure format
	for( const folderPath of folderStructureKeys) {
		let yearIndex, monthIndex;

		// Turn the path into an array to determine index position
		const directories = folderPath.split( '/' );

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
		const year = regexYear.exec( folderPath ); // Returns an array with the regex-matching value

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
		const month = regexMonth.exec( folderPath ); // Returns an array with the regex-matching value

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
		} else {
			console.log( chalk.yellow( '✕' ), 'Recommended: Structure your WordPress media files into', chalk.magenta( '`uploads/YYYY/MM`' ), 'directories' );
			console.log();
			errors++;
		}
 }

	if ( errors ) {
		recommendedFileStructure();
	}

	return;
};

/**
	* Character validation
 *
 * This logic is based on the WordPress core function `sanitize_file_name()`
 * https://developer.wordpress.org/reference/functions/sanitize_file_name/
 *
 * @param {string} filename - The current file being validated
 * @returns {Boolean} - Checks if the filename has been sanitized
 */
export const isFileSanitized = file => {
	const filename = path.basename( file );
	
	let sanitizedFile = filename;

	// Prohibited characters:
	// Encoded spaces (%20), no-break spaces - keeps words together (\u00A0), and plus signs
	const regexSpaces = /\u00A0|(%20)|\+/g;
	sanitizedFile = sanitizedFile.replace( regexSpaces, ' ' );

	// Prohibited characters:
	// Special characters: + & # % = ' " \ < > : ; , / ? $ * | ` ! { }
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
export const doesImageHaveExistingSource = file => {
	const filename = path.basename( file );

	// Intermediate image regex check
	const intermediateImage = identifyIntermediateImage( filename );

	if ( null !== intermediateImage ) {
		const imageSizing = intermediateImage[ 0 ]; // First capture group of the regex validation
		const extension = path.extname( filename ).substr( 1 ); // Extension of the path (e.g.- `.jpg`)

		// Filename manipulation: if an image is an intermediate image, strip away the image sizing
		// e.g.- `panda4000x6000.png` -> `panda.png`
		const baseFileName = filename.replace( imageSizing, '' ) + '.' + extension;
		
		const splitFolder = file.split('/');

		// Remove the last element (intermediate image filename) and replace it with the original image filename
		splitFolder.splice( splitFolder.length -1, 1, baseFileName );

		const originalImage = splitFolder.join( '/' );

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
	console.log( '------------------------------------------------------------' );
	console.log();

	invalidFiles.map( file => {
		console.error( chalk.red( '✕' ), 'File extensions: Invalid file type for file: ', chalk.cyan( `${ file }` ) );
	} );

	console.log();
	recommendAcceptableFileTypes();
	console.log( '------------------------------------------------------------' );
	console.log();
};

// Log errors for files with invalid filenames and show a list of accepted/prohibited chars
export const logErrorsForInvalidFilenames = invalidFiles => {
	invalidFiles.map( file => {
		console.error( chalk.red( '✕' ), 'Character validation: Invalid filename for file: ', chalk.cyan( `${ file }` ) );
	} );

	console.log();
	recommendAcceptableFileNames();
	console.log( '------------------------------------------------------------' );
	console.log();
};

// Log errors for intermediate image file duplicates
export const logErrorsForIntermediateImages = obj => {
	for ( const original in obj ) {
		console.error(
			chalk.red( '✕' ),
			'Intermediate images: Duplicate files found:\n' +
			'Original file: ' + chalk.blue( `${ original }\n` ) +
			'Intermediate images: ' + chalk.cyan( `${ obj[ original ] }\n` ),
		);
	}
	console.log( '------------------------------------------------------------' );
};
