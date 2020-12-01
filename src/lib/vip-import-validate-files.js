// @flow

/**
 * External dependencies
 */
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

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
// eslint-disable-next-line
const acceptedCharacters = [ 'Non-English characters', '(', ')', '[', ']', '~', '&', '#', '%', '=', '’', '\'', '×', '@', '`', '?', '*', '!', '\"', '\\', '<', '>', ':', ';', ',', '/', '$', '|', '`', '{', '}', 'spaces' ];
const acceptedCharactersSet = new Set( acceptedCharacters ); // Prevent duplicates with a Set

// Prohibited characters in filenames
const prohibitedCharacters = [ '+', '%20' ];
const prohibitedCharactersSet = new Set( prohibitedCharacters );

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
		chalk.green( `All special characters, including: ${ allowedCharacters }\n\n` ) +
		'The following characters are prohibited in file names:\n' +
		chalk.red( `Encoded or alternate whitespace, such as ${ notAllowedCharacters }, are converted to proper spaces\n` )
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
const files = [];
const folderStructureObj = {};

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
				findNestedDirectories( filePath );
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
 * Identify the index position of each directory to validate the folder structure
 *
 *	@param {string} folderPath Path of the entire folder structure
 *  @param {Boolean} sites Check if site is a multisite or single site
 *  @return {Object} indexes
 */
const getIndexPositionOfFolders = ( folderPath, sites ) => {
	let sitesIndex, siteIDIndex, yearIndex, monthIndex;
	let pathMutate = folderPath; // Mutate `path` for multisites

	// Turn the path into an array to determine index position
	const directories = pathMutate.split( '/' );

	/**
		* Upload folder
		*
		* Find if an `uploads` folder exists and return its index position
		*/
	const uploadsIndex = directories.indexOf( 'uploads' );

	/**
		* Multisite folder
		*
		* If a sites directory exists, find the directory and return its index position
		* Find if a siteID folder exists via regex, then obtain that value
		*/
	if ( sites ) {
		sitesIndex = directories.indexOf( 'sites' );

		const regexSiteID = /\/sites\/(\d+)/g;
		const siteID = regexSiteID.exec( pathMutate ); // Returns an array with the regex-matching value

		if ( siteID ) {
			siteIDIndex = directories.indexOf( siteID[ 1 ] );
		}

		// Remove the multisite-specific path to avoid confusing a 2 digit site ID with the month
		// e.g.- `uploads/sites/11/2020/06` -> `uploads/2020/06`
		pathMutate = pathMutate.replace( siteID[ 0 ], '' );
	}

	/**
		* Year folder
		*
		* Find if a year folder exists via a four digit regex matching pattern,
		* then obtain that value
		*/
	const regexYear = /\b\d{4}\b/g;
	const year = regexYear.exec( pathMutate ); // Returns an array with the regex-matching value

	if ( year ) {
		yearIndex = directories.indexOf( year[ 0 ] );
	}

	/**
		* Month folder
		*
		* Find if a month folder exists via a two digit regex matching pattern,
		* then obtain that value
		*/
	const regexMonth = /\b\d{2}\b/g;
	const month = regexMonth.exec( pathMutate ); // Returns an array with the regex-matching value

	if ( month ) {
		monthIndex = directories.indexOf( month[ 0 ] );
	}

	// Multisite
	if ( sites ) {
		return {
			uploadsIndex,
			sitesIndex,
			siteIDIndex,
			yearIndex,
			monthIndex,
		};
	}

	// Single site
	return {
		uploadsIndex,
		yearIndex,
		monthIndex,
	};
};

/**
 * Single site folder structure validation
 *
 * - Uploads directory validation
 * - Year & month directory validation
 *
 * Check if the folder structure follows the WordPress recommended folder structure for media files:
 * - Single sites: `uploads/year/month`
 *
 * @param {string} folderPath Path of the entire folder structure
	* @returns {string|null} Returns null if the folder structure is good; else, returns the folder path
 */
const singleSiteValidation = folderPath => {
	let errors = 0; // Tally individual folder errors

	console.log( chalk.bold( 'Folder:' ), chalk.cyan( `${ folderPath }` ) );

	// Use destructuring to retrieve the index position of each folder
	const {
		uploadsIndex,
		yearIndex,
		monthIndex,
	} = getIndexPositionOfFolders( folderPath );

	/**
		* Logging
		*/

	// Uploads folder
	if ( uploadsIndex === 0 ) {
		console.log();
		console.log( '✅ File structure: Uploads directory exists' );
	} else {
		console.log();
		console.log( chalk.yellow( '✕' ), 'Recommended: Media files should reside in an', chalk.magenta( '`uploads`' ), 'directory' );
		errors++;
	}

	// Year folder
	if ( yearIndex && yearIndex === 1 ) {
		console.log( '✅ File structure: Year directory exists (format: YYYY)' );
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

	// Push individual folder errors to the collective array of errors
	if ( errors > 0 ) {
		return folderPath;
	}

	return null;
};

/**
 * Multisite folder structure validation
 *
 * - Uploads directory validation
 * - Sites & site ID directory validation
 * - Year & month directory validation
 *
 * Check if the folder structure follows the WordPress recommended folder structure for media files:
 * - Multisites: `uploads/sites/siteID/year/month`
 *
 * @param {string} folderPath Path of the entire folder structure
	* @returns {string|null} Returns null if the folder structure is good; else, returns the folder path
 */
const multiSiteValidation = folderPath => {
	let errors = 0; // Tally individual folder errors

	console.log( chalk.bold( 'Folder:' ), chalk.cyan( `${ folderPath }` ) );

	// Use destructuring to retrieve the index position of each folder
	const {
		uploadsIndex,
		sitesIndex,
		siteIDIndex,
		yearIndex,
		monthIndex,
	} = getIndexPositionOfFolders( folderPath, true );

	/**
		* Logging
		*/

	// Uploads folder
	if ( uploadsIndex === 0 ) {
		console.log();
		console.log( '✅ File structure: Uploads directory exists' );
	} else {
		console.log();
		console.log( chalk.yellow( '✕' ), 'Recommended: Media files should reside in an', chalk.magenta( '`uploads`' ), 'directory' );
		errors++;
	}

	// Sites folder
	if ( sitesIndex === 1 ) {
		console.log( '✅ File structure: Sites directory exists' );
	} else {
		console.log();
		console.log( chalk.yellow( '✕' ), 'Recommended: Media files should reside in an', chalk.magenta( '`sites`' ), 'directory' );
		errors++;
	}

	// Site ID folder
	if ( siteIDIndex && siteIDIndex === 2 ) {
		console.log( '✅ File structure: Site ID directory exists' );
	} else {
		console.log( chalk.yellow( '✕' ), 'Recommended: Structure your WordPress media files into', chalk.magenta( '`uploads/sites/<siteID>`' ), 'directories' );
		errors++;
	}

	// Year folder
	if ( yearIndex && yearIndex === 3 ) {
		console.log( '✅ File structure: Year directory exists (format: YYYY)' );
	} else {
		console.log( chalk.yellow( '✕' ), 'Recommended: Structure your WordPress media files into', chalk.magenta( '`uploads/sites/<siteID>/YYYY`' ), 'directories' );
		errors++;
	}

	// Month folder
	if ( monthIndex && monthIndex === 4 ) {
		console.log( '✅ File structure: Month directory exists (format: MM)' );
		console.log();
	} else {
		console.log( chalk.yellow( '✕' ), 'Recommended: Structure your WordPress media files into', chalk.magenta( '`uploads/sites/<siteID>/YYYY/MM`' ), 'directories' );
		console.log();
		errors++;
	}

	// Push individual folder errors to the collective array of errors
	if ( errors > 0 ) {
		return folderPath;
	}

	return null;
};

/**
 * Folder structure validation
 *
 * Validate folder structures and identify folders that don't follow the recommended structure
 *
 * @param {Array} folderStructureKeys Array of paths for each folder
	* @return {Array} All the erroneous folder paths in an array
 */
export const folderStructureValidation = folderStructureKeys => {
	// Collect all the folder paths that aren't in the recommended structure
	const allErrors = [];

	// Loop through each path to validate the folder structure format
	for ( const folderPath of folderStructureKeys ) {
		let badFolders;

		// Check for multisite folder structure
		if ( folderPath.search( 'sites' ) !== -1 ) {
			// Returns null if the folder path is good, otherwise it returns the folder path itself
			badFolders = multiSiteValidation( folderPath );
		} else {
			// Returns null if the folder path is good, otherwise it returns the folder path itself
			badFolders = singleSiteValidation( folderPath );
		}

		if ( badFolders ) {
			allErrors.push( badFolders );
		}
	}

	if ( allErrors.length > 0 ) {
		recommendedFileStructure();
	}

	return allErrors;
};

/**
	* Character validation
 *
 * This logic is based on the WordPress core function `sanitize_file_name()`
 * https://developer.wordpress.org/reference/functions/sanitize_file_name/
 *
 * @param {string} file - The current file being validated
 * @returns {Boolean} - Checks if the filename has been sanitized
 */
export const isFileSanitized = file => {
	const filename = path.basename( file );

	let sanitizedFile = filename;

	// Convert encoded or alternate whitespace into a proper space
	// Encoded spaces (%20), no-break spaces - keeps words together (\u00A0), and plus signs
	const regexSpaces = /\u00A0|(%20)|\+/g;
	sanitizedFile = sanitizedFile.replace( regexSpaces, ' ' );

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

		const splitFolder = file.split( '/' );

		// Remove the last element (intermediate image filename) and replace it with the original image filename
		splitFolder.splice( splitFolder.length - 1, 1, baseFileName );

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

export const summaryLogs = ( {
	folderErrorsLength,
	intImagesErrorsLength,
	fileTypeErrorsLength,
	filenameErrorsLength,
	totalFiles,
	totalFolders,
} ) => {
	if ( folderErrorsLength > 0 ) {
		folderErrorsLength = chalk.bgYellow( ' RECOMMENDED ' ) + chalk.bold.yellow( ` ${ folderErrorsLength } folders, ` ) + `${ totalFolders } folders total`;
	} else {
		folderErrorsLength = chalk.bgGreen( '    PASS     ' ) + chalk.bold.green( ` ${ totalFolders } folders, ` ) + `${ totalFolders } folders total`;
	}

	if ( intImagesErrorsLength > 0 ) {
		intImagesErrorsLength = chalk.white.bgRed( '   ERROR     ' ) + chalk.red( ` ${ intImagesErrorsLength } intermediate images` ) + `, ${ totalFiles } files total`;
	} else {
		intImagesErrorsLength = chalk.white.bgGreen( '    PASS     ' ) + chalk.green( ` ${ intImagesErrorsLength } intermediate images` ) + `, ${ totalFiles } files total`;
	}

	if ( fileTypeErrorsLength > 0 ) {
		fileTypeErrorsLength = chalk.white.bgRed( '   ERROR     ' ) + chalk.red( ` ${ fileTypeErrorsLength } invalid file extensions` ) + `, ${ totalFiles } files total`;
	} else {
		fileTypeErrorsLength = chalk.white.bgGreen( '    PASS     ' ) + chalk.green( ` ${ fileTypeErrorsLength } invalid file extensions` ) + `, ${ totalFiles } files total`;
	}

	if ( filenameErrorsLength ) {
		filenameErrorsLength = chalk.white.bgRed( '   ERROR     ' ) + chalk.red( ` ${ filenameErrorsLength } invalid filenames` ) + `, ${ totalFiles } files total`;
	} else {
		filenameErrorsLength = chalk.bgGreen( '    PASS     ' ) + chalk.green( ` ${ filenameErrorsLength } invalid filenames` ) + `, ${ totalFiles } files total`;
	}

	console.log( `\n${ folderErrorsLength }\n${ intImagesErrorsLength }\n${ fileTypeErrorsLength }\n${ filenameErrorsLength }\n` );
};
