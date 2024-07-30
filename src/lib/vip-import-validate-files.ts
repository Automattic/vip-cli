/**
 * External dependencies
 */
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

/**
 * Internal dependencies
 */
import { GENERIC_BIN_TYPES, GENERIC_TEXT_TYPES } from './constants/file-type';
import { getFileType } from './validations/utils';
import { MediaImportConfig } from '../graphqlTypes';

export const enum ValidateFilesErrors {
	INVALID_TYPES = 'invalid_types',
	INTERMEDIATE_IMAGES = 'intermediate_images',
	INVALID_SIZES = 'invalid_sizes',
	INVALID_NAMES = 'invalid_names',
	INVALID_NAME_CHARACTER_COUNTS = 'invalid_name_character_counts',
}

interface LogErrorOptions {
	errorType: ValidateFilesErrors;
	invalidFiles: string[];
	limit?: string | number | Record< string, string >;
}

interface ExtType {
	ext: string | null;
	type: string[] | null;
}

interface MediaImportAllowedFileTypes {
	[ key: string ]: unknown;
}

interface ValidationResult {
	intermediateImagesTotal: number;
	errorFileTypes: string[];
	errorFileNames: string[];
	errorFileSizes: string[];
	errorFileNamesCharCount: string[];
	intermediateImages: { [ key: string ]: string };
}

function hasValidMimetype( file: string, fileExtType: ExtType ): boolean {
	console.log( file );
	let realMimeType: string;
	try {
		realMimeType = getFileType( file );
	} catch ( error ) {
		console.warn(
			`Failed to extract mimetype of file ${ file } because of error:`,
			( error as Error ).message
		);
		return false;
	}

	const realMimeSplit = realMimeType.split( '/' );
	const typeSplit = fileExtType.type?.map( type => type.split( '/' )[ 0 ] ) || [];

	if ( GENERIC_BIN_TYPES.includes( realMimeType ) ) {
		// `file` sometimes will return a file as a generic binary type. In which case we will need to check it
		// against the expected MIME type. We only allow the file to be uploaded if the expected MIME types are
		// one of `application`, `video` or `audio` which are expected to be binary files.
		if ( ! typeSplit.some( type => [ 'application', 'video', 'audio' ].includes( type ) ) ) {
			return false;
		}
	} else if ( realMimeSplit[ 0 ] === 'video' || realMimeSplit[ 0 ] === 'audio' ) {
		// For audio and video files, we only need to check that the real MIME type and the expected MIME type
		// matches in the major part. This allows for media files that are named with the wrong extension
		// i.e.: `.mov` instead of `.mp4`
		if ( realMimeSplit[ 0 ] !== typeSplit[ 0 ] ) {
			return false;
		}
	} else if ( realMimeType === 'text/plain' ) {
		// A few common file types are sometimes detected as `text/plain`, allow those.
		if ( ! fileExtType.type?.some( type => GENERIC_TEXT_TYPES.includes( type ) ) ) {
			return false;
		}
	} else if ( realMimeType === 'text/rtf' ) {
		// Check for RTF files
		const rtfTypes = [ 'ext/rtf', 'text/plain', 'application/rtf' ];
		if ( ! fileExtType.type?.some( type => rtfTypes.includes( type ) ) ) {
			return false;
		}
	} else if ( ! fileExtType.type?.includes( realMimeType ) ) {
		// For every other case, assume it's dangerous if expected type doesn't match real type
		return false;
	}

	return true;
}

/**
 * File info validation
 *
 * Validate the file info for media files
 */
export async function validateFiles(
	files: string[],
	mediaImportConfig: MediaImportConfig
): Promise< ValidationResult > {
	const validationResult: ValidationResult = {
		intermediateImagesTotal: 0,
		errorFileTypes: [],
		errorFileNames: [],
		errorFileSizes: [],
		errorFileNamesCharCount: [],
		intermediateImages: {},
	};

	const fileValidationPromises = files.map( async file => {
		const isFolder = await isDirectory( file );
		const fileExtType = getFileExtType(
			file,
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			<MediaImportAllowedFileTypes>mediaImportConfig.allowedFileTypes
		);

		console.log( fileExtType );

		if ( isInvalidFile( fileExtType, isFolder ) || ! hasValidMimetype( file, fileExtType ) ) {
			validationResult.errorFileTypes.push( file );
		}

		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		if ( ! isFileSizeValid( file, <number>mediaImportConfig.fileSizeLimitInBytes ) ) {
			validationResult.errorFileSizes.push( file );
		}

		if ( isFileSanitized( file ) ) {
			validationResult.errorFileNames.push( file );
		}

		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		if ( ! isFileNameCharCountValid( file, <number>mediaImportConfig?.fileNameCharCount ) ) {
			validationResult.errorFileNamesCharCount.push( file );
		}

		const original = doesImageHaveExistingSource( file );
		if ( original ) {
			validationResult.intermediateImagesTotal++;
			if ( validationResult.intermediateImages[ original ] ) {
				validationResult.intermediateImages[ original ] += `, ${ file }`;
			} else {
				validationResult.intermediateImages[ original ] = file;
			}
		}
	} );

	await Promise.all( fileValidationPromises );

	return validationResult;
}

export const isDirectory = async ( file: string ): Promise< boolean > => {
	const stats = await fs.promises.stat( file );
	return stats.isDirectory();
};

const getFileExtType = (
	file: string,
	allowedFileTypes: MediaImportAllowedFileTypes | null
): ExtType => {
	if ( ! allowedFileTypes ) return { ext: null, type: null };
	return getExtAndType( file, allowedFileTypes );
};

const isInvalidFile = ( fileExtType: ExtType, isFolder: boolean ): boolean => {
	return ! fileExtType.type || ! fileExtType.ext || isFolder;
};

const getExtAndType = (
	filePath: string,
	allowedFileTypes: MediaImportAllowedFileTypes
): ExtType => {
	const extType: ExtType = { ext: null, type: null };
	for ( const [ key, value ] of Object.entries( allowedFileTypes ) ) {
		// Create a regular expression to match the file extension
		// eslint-disable-next-line security/detect-non-literal-regexp
		const regex = new RegExp( `(?:\\.)(${ key })$`, 'i' );
		const matches = regex.exec( filePath );
		if ( matches ) {
			extType.type = typeof value === 'string' ? [ value ] : ( value as string[] );
			extType.ext = matches[ 1 ];
			break;
		}
	}
	return extType;
};

const isFileSizeValid = ( filePathOnDisk: string, fileSizeLimitInBytes: number ): boolean => {
	const fileStat: fs.Stats = fs.statSync( filePathOnDisk );
	return fileSizeLimitInBytes >= fileStat.size;
};

const isFileNameCharCountValid = ( file: string, fileNameCharCount: number ): boolean => {
	const filename: string = path.basename( file );
	return filename.length <= fileNameCharCount;
};

/**
 * End file info validation
 */

/**
 * Character validation global variables
 *
 * Accepted and prohibited characters for filenames
 */

// Accepted characters in filenames
// eslint-disable-next-line max-len
const acceptedCharacters = [
	'Non-English characters',
	'(',
	')',
	'[',
	']',
	'~',
	'&',
	'#',
	'%',
	'=',
	'’',
	`'`,
	'×',
	'@',
	'`',
	'?',
	'*',
	'!',
	'"',
	'\\',
	'<',
	'>',
	':',
	';',
	',',
	'/',
	'$',
	'|',
	'`',
	'{',
	'}',
	'spaces',
];
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
const recommendedFileStructure = (): void => {
	console.log(
		chalk.underline(
			'We recommend the WordPress default folder structure for your media files: \n\n'
		) +
			chalk.underline( 'Single sites:' ) +
			chalk.yellow( '`uploads/year/month/image.png`\n' ) +
			' e.g.-' +
			chalk.yellow( '`uploads/2020/06/image.png`\n' ) +
			chalk.underline( 'Multisites:' ) +
			chalk.cyan( '`uploads/sites/siteID/year/month/image.png`\n' ) +
			' e.g.-' +
			chalk.cyan( '`uploads/sites/5/2020/06/images.png`\n' )
	);
	console.log( '------------------------------------------------------------' );
	console.log();
};

// Recommend accepted file types
const recommendAcceptableFileTypes = ( allowedFileTypesString: string ): void => {
	console.log( 'Accepted file types: \n\n' + chalk.magenta( `${ allowedFileTypesString }` ) );
	console.log();
};

// Accepted file name characters
const recommendAcceptableFileNames = (): void => {
	const allowedCharacters = [ ...acceptedCharactersSet ].join( ' ' );
	const notAllowedCharacters = [ ...prohibitedCharactersSet ].join( ' ' );

	console.log(
		'The following characters are allowed in file names:\n' +
			chalk.green( `All special characters, including: ${ allowedCharacters }\n\n` ) +
			'The following characters are prohibited in file names:\n' +
			chalk.red(
				`Encoded or alternate whitespace, such as ${ notAllowedCharacters }, are converted to proper spaces\n`
			)
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
const files: string[] = [];
const folderStructureObj: Record< string, boolean > = {};

interface FindNestedDirectoriesResult {
	files: string[];
	folderStructureObj: Record< string, boolean >;
}

export const findNestedDirectories = (
	directory: string
): FindNestedDirectoriesResult | undefined => {
	let nestedDirectories: string[];

	try {
		// Read nested directories within the given directory
		nestedDirectories = fs.readdirSync( directory );

		// Filter out hidden files such as .DS_Store
		nestedDirectories = nestedDirectories.filter( file => ! /(^|\/)\.[^/.]/g.test( file ) );

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
		console.error(
			chalk.red( '✕' ),
			` Error: Cannot read nested directory: ${ directory }. Reason: ${
				( error as Error ).message
			}`
		);
		return;
	}

	return { files, folderStructureObj };
};

interface IndexPositionsSingleSite {
	uploadsIndex: number | undefined;
	yearIndex: number | undefined;
	monthIndex: number | undefined;
}

interface IndexPositionsMultiSite extends IndexPositionsSingleSite {
	sitesIndex: number | undefined;
	siteIDIndex: number | undefined;
}

/**
 * Folder structure validation
 *
 * Identify the index position of each directory to validate the folder structure
 *
 * @param {string}  folderPath Path of the entire folder structure
 * @param {boolean} sites      Check if site is a multisite or single site
 * @return {Object} indexes
 */
function getIndexPositionOfFolders( folderPath: string, sites?: false ): IndexPositionsSingleSite;
function getIndexPositionOfFolders( folderPath: string, sites?: true ): IndexPositionsMultiSite;
function getIndexPositionOfFolders(
	folderPath: string,
	sites = false
): IndexPositionsSingleSite | IndexPositionsMultiSite {
	let sitesIndex: number | undefined;
	let siteIDIndex: number | undefined;
	let yearIndex: number | undefined;
	let monthIndex: number | undefined;
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

			// Remove the multisite-specific path to avoid confusing a 2 digit site ID with the month
			// e.g.- `uploads/sites/11/2020/06` -> `uploads/2020/06`
			pathMutate = pathMutate.replace( siteID[ 0 ], '' );
		}
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
}

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
 * @return {string|null} Returns null if the folder structure is good; else, returns the folder path
 */
const singleSiteValidation = ( folderPath: string ): string | null => {
	let errors = 0; // Tally individual folder errors

	console.log( chalk.bold( 'Folder:' ), chalk.cyan( `${ folderPath }` ) );

	// Use destructuring to retrieve the index position of each folder
	const { uploadsIndex, yearIndex, monthIndex } = getIndexPositionOfFolders( folderPath );

	/**
	 * Logging
	 */

	// Uploads folder
	if ( uploadsIndex === 0 ) {
		console.log();
		console.log( '✅ File structure: Uploads directory exists' );
	} else {
		console.log();
		console.log(
			chalk.yellow( '✕' ),
			'Recommended: Media files should reside in an',
			chalk.magenta( '`uploads`' ),
			'directory'
		);
		errors++;
	}

	// Year folder
	if ( yearIndex && yearIndex === 1 ) {
		console.log( '✅ File structure: Year directory exists (format: YYYY)' );
	} else {
		console.log(
			chalk.yellow( '✕' ),
			'Recommended: Structure your WordPress media files into',
			chalk.magenta( '`uploads/YYYY`' ),
			'directories'
		);
		errors++;
	}

	// Month folder
	if ( monthIndex && monthIndex === 2 ) {
		console.log( '✅ File structure: Month directory exists (format: MM)' );
		console.log();
	} else {
		console.log(
			chalk.yellow( '✕' ),
			'Recommended: Structure your WordPress media files into',
			chalk.magenta( '`uploads/YYYY/MM`' ),
			'directories'
		);
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
 * @return {string|null} Returns null if the folder structure is good; else, returns the folder path
 */
const multiSiteValidation = ( folderPath: string ): string | null => {
	let errors = 0; // Tally individual folder errors

	console.log( chalk.bold( 'Folder:' ), chalk.cyan( `${ folderPath }` ) );

	// Use destructuring to retrieve the index position of each folder
	const { uploadsIndex, sitesIndex, siteIDIndex, yearIndex, monthIndex } =
		getIndexPositionOfFolders( folderPath, true );

	/**
	 * Logging
	 */

	// Uploads folder
	if ( uploadsIndex === 0 ) {
		console.log();
		console.log( '✅ File structure: Uploads directory exists' );
	} else {
		console.log();
		console.log(
			chalk.yellow( '✕' ),
			'Recommended: Media files should reside in an',
			chalk.magenta( '`uploads`' ),
			'directory'
		);
		errors++;
	}

	// Sites folder
	if ( sitesIndex === 1 ) {
		console.log( '✅ File structure: Sites directory exists' );
	} else {
		console.log();
		console.log(
			chalk.yellow( '✕' ),
			'Recommended: Media files should reside in an',
			chalk.magenta( '`sites`' ),
			'directory'
		);
		errors++;
	}

	// Site ID folder
	if ( siteIDIndex && siteIDIndex === 2 ) {
		console.log( '✅ File structure: Site ID directory exists' );
	} else {
		console.log(
			chalk.yellow( '✕' ),
			'Recommended: Structure your WordPress media files into',
			chalk.magenta( '`uploads/sites/<siteID>`' ),
			'directories'
		);
		errors++;
	}

	// Year folder
	if ( yearIndex && yearIndex === 3 ) {
		console.log( '✅ File structure: Year directory exists (format: YYYY)' );
	} else {
		console.log(
			chalk.yellow( '✕' ),
			'Recommended: Structure your WordPress media files into',
			chalk.magenta( '`uploads/sites/<siteID>/YYYY`' ),
			'directories'
		);
		errors++;
	}

	// Month folder
	if ( monthIndex && monthIndex === 4 ) {
		console.log( '✅ File structure: Month directory exists (format: MM)' );
		console.log();
	} else {
		console.log(
			chalk.yellow( '✕' ),
			'Recommended: Structure your WordPress media files into',
			chalk.magenta( '`uploads/sites/<siteID>/YYYY/MM`' ),
			'directories'
		);
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
export const folderStructureValidation = ( folderStructureKeys: string[] ): string[] => {
	// Collect all the folder paths that aren't in the recommended structure
	const allErrors: string[] = [];

	// Loop through each path to validate the folder structure format
	for ( const folderPath of folderStructureKeys ) {
		let badFolders: string | null;

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
 * @return {boolean} - Checks if the filename has been sanitized
 */
export const isFileSanitized = ( file: string ): boolean => {
	const filename = path.basename( file );

	let sanitizedFile = filename;

	// Convert encoded or alternate whitespace into a proper space
	// Encoded spaces (%20), no-break spaces - keeps words together (\u00A0), and plus signs
	const regexSpaces = /\u00A0|(%20)|\+/g;
	sanitizedFile = sanitizedFile.replace( regexSpaces, ' ' );

	// Check if the filename has been sanitized

	return sanitizedFile !== filename;
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
 * @return {Array} Returns an array of the matching regex characters
 */
const identifyIntermediateImage = ( filename: string ): RegExpMatchArray | null => {
	// eslint-disable-next-line security/detect-unsafe-regex
	const regex = /([_-])?(\d+x\d+)(@\d+\w)?(\.\w{3,4})$/;
	return filename.match( regex ); // NOSONAR
};

// Check if an intermediate image has an existing original (source) image
export const doesImageHaveExistingSource = ( file: string ): string | false => {
	const filename = path.basename( file );

	// Intermediate image regex check
	const intermediateImage = identifyIntermediateImage( filename );
	if ( null !== intermediateImage ) {
		const imageSizing = intermediateImage[ 0 ]; // First capture group of the regex validation
		const extension = path.extname( filename ).slice( 1 ); // Extension of the path (e.g.- `.jpg`)

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
	}
	return false;
};

/**
 * Error logging
 *
 * Log errors for invalid folders or files
 */

export const logErrors = ( { errorType, invalidFiles, limit }: LogErrorOptions ): void => {
	if ( invalidFiles.length === 0 ) {
		return;
	}

	invalidFiles.forEach( file => {
		switch ( errorType ) {
			case ValidateFilesErrors.INVALID_TYPES:
				console.error(
					chalk.red( '✕' ),
					'File extensions: Invalid file type for file: ',
					chalk.cyan( `${ file }` )
				);
				console.log();
				recommendAcceptableFileTypes( limit as string );
				break;
			case ValidateFilesErrors.INTERMEDIATE_IMAGES:
				console.error(
					chalk.red( '✕' ),
					'Intermediate images: Duplicate files found:\n' +
						'Original file: ' +
						chalk.blue( `${ file }\n` ) +
						'Intermediate images: ' +
						chalk.cyan( `${ ( limit as Record< string, string > )[ file ] }\n` )
				);
				break;
			case ValidateFilesErrors.INVALID_SIZES:
				console.error(
					chalk.red( '✕' ),
					`File size cannot be more than ${ ( limit as number ) / 1024 / 1024 / 1024 } GB`,
					chalk.cyan( `${ file }` )
				);
				console.log();
				break;
			case ValidateFilesErrors.INVALID_NAME_CHARACTER_COUNTS:
				console.error(
					chalk.red( '✕' ),
					`File name cannot have more than ${ limit as number } characters`,
					chalk.cyan( `${ file }` )
				);
				break;
			case ValidateFilesErrors.INVALID_NAMES:
				console.error(
					chalk.red( '✕' ),
					'Character validation: Invalid filename for file: ',
					chalk.cyan( `${ file }` )
				);
				recommendAcceptableFileNames();
				break;

			default:
				console.error( chalk.red( '✕' ), 'Unknown error type:', errorType );
		}
	} );
	console.log();
};

interface SummaryLogsParams {
	folderErrorsLength: number;
	intImagesErrorsLength: number;
	fileTypeErrorsLength: number;
	fileErrorFileSizesLength: number;
	filenameErrorsLength: number;
	fileNameCharCountErrorsLength: number;
	totalFiles: number;
	totalFolders: number;
}

export const summaryLogs = ( {
	folderErrorsLength,
	intImagesErrorsLength,
	fileTypeErrorsLength,
	fileErrorFileSizesLength,
	filenameErrorsLength,
	fileNameCharCountErrorsLength,
	totalFiles,
	totalFolders,
}: SummaryLogsParams ) => {
	const messages: string[] = [];
	if ( folderErrorsLength > 0 ) {
		messages.push(
			chalk.bgYellow( ' RECOMMENDED ' ) +
				chalk.bold.yellow( ` ${ folderErrorsLength } folders, ` ) +
				`${ totalFolders } folders total`
		);
	} else {
		messages.push(
			chalk.bgGreen( '    PASS     ' ) +
				chalk.bold.green( ` ${ totalFolders } folders, ` ) +
				`${ totalFolders } folders total`
		);
	}

	if ( intImagesErrorsLength > 0 ) {
		messages.push(
			chalk.white.bgRed( '   ERROR     ' ) +
				chalk.red( ` ${ intImagesErrorsLength } intermediate images` ) +
				`, ${ totalFiles } files total`
		);
	} else {
		messages.push(
			chalk.white.bgGreen( '    PASS     ' ) +
				chalk.green( ` ${ intImagesErrorsLength } intermediate images` ) +
				`, ${ totalFiles } files total`
		);
	}

	if ( fileTypeErrorsLength > 0 ) {
		messages.push(
			chalk.white.bgRed( '   ERROR     ' ) +
				chalk.red( ` ${ fileTypeErrorsLength } invalid file extensions` ) +
				`, ${ totalFiles } files total`
		);
	} else {
		messages.push(
			chalk.white.bgGreen( '    PASS     ' ) +
				chalk.green( ` ${ fileTypeErrorsLength } invalid file extensions` ) +
				`, ${ totalFiles } files total`
		);
	}

	if ( fileErrorFileSizesLength > 0 ) {
		messages.push(
			chalk.white.bgRed( '   ERROR     ' ) +
				chalk.red( ` ${ fileTypeErrorsLength } invalid file sizes` ) +
				`, ${ totalFiles } files total`
		);
	} else {
		messages.push(
			chalk.white.bgGreen( '    PASS     ' ) +
				chalk.green( ` ${ fileTypeErrorsLength } invalid file sizes` ) +
				`, ${ totalFiles } files total`
		);
	}

	if ( filenameErrorsLength ) {
		messages.push(
			chalk.white.bgRed( '   ERROR     ' ) +
				chalk.red( ` ${ filenameErrorsLength } invalid filenames` ) +
				`, ${ totalFiles } files total`
		);
	} else {
		messages.push(
			chalk.bgGreen( '    PASS     ' ) +
				chalk.green( ` ${ filenameErrorsLength } invalid filenames` ) +
				`, ${ totalFiles } files total`
		);
	}

	if ( fileNameCharCountErrorsLength ) {
		messages.push(
			chalk.white.bgRed( '   ERROR     ' ) +
				chalk.red(
					` ${ filenameErrorsLength } file names reached the maximum character count limit `
				) +
				`, ${ totalFiles } files total`
		);
	} else {
		messages.push(
			chalk.bgGreen( '    PASS     ' ) +
				chalk.green(
					` ${ filenameErrorsLength } file names reached the maximum character count limit`
				) +
				`, ${ totalFiles } files total`
		);
	}

	console.log( `\n${ messages.join( '\n' ) }\n` );
};
