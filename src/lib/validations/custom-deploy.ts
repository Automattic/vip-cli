import AdmZip from 'adm-zip';
import { constants } from 'node:fs';
import path from 'path';
import * as tar from 'tar';

import * as exit from '../../lib/cli/exit';

interface TarEntry {
	path: string;
	type: string;
	mode: number | undefined;
}

const errorMessages = {
	missingThemes: 'Missing `themes` directory from root folder!',
	symlink: 'Symlink detected: ',
	singleRootDir: 'The compressed file must contain a single root directory!',
	invalidExt: 'Invalid file extension. Please provide a .zip, .tar.gz, or a .tgz file.',
	invalidChars: ( filename: string, invalidChars: string ) =>
		`Filename ${ filename } contains disallowed characters: ${ invalidChars }`,
};
const symlinkIgnorePattern = /\/node_modules\/[^/]+\/\.bin\//;
const macosxDir = '__MACOSX';

/**
 * Check if a file has a valid extension
 *
 * @param {string} filename The file extension
 * @returns {boolean} True if the extension is valid
 */
export function validateDeployFileExt( filename: string ): void {
	let ext = path.extname( filename ).toLowerCase();

	if ( ext === '.gz' && path.extname( path.basename( filename, ext ) ) === '.tar' ) {
		ext = '.tar.gz';
	}

	if ( ! [ '.zip', '.tar.gz', '.tgz' ].includes( ext ) ) {
		exit.withError( errorMessages.invalidExt );
	}
}

/**
 * Check if a file has a valid name
 * @param {string} filename The file name
 * @returns {boolean} True if the filename is valid
 */
export function validateFilename( filename: string ) {
	const re = /^[a-z0-9\-_.]+$/i;

	if ( ! re.test( filename ) ) {
		exit.withError( errorMessages.invalidChars( filename, '[0-9,a-z,A-Z,-,_,.]' ) );
	}
}

/**
 * Validate the name of a file for disallowed characters
 *
 * @param {string} name The name of the file
 * @param {bool} isDirectory Whether the file is a directory
 */
export function validateName( name: string, isDirectory: boolean ) {
	if ( name.startsWith( '._' ) ) {
		return;
	}

	const invalidCharsPattern = isDirectory ? /[!:*?"<>|']|^\.\..*$/ : /[!/:*?"<>|']|^\.\..*$/;
	const errorMessage = errorMessages.invalidChars(
		name,
		isDirectory ? '[!:*?"<>|\'/^..]+' : '[!/:*?"<>|\'/^..]+'
	);
	if ( invalidCharsPattern.test( name ) ) {
		exit.withError( errorMessage );
	}
}

/**
 * Validate the existence of a symlink in a zip file. Ignores symlinks in node_modules/.bin/
 *
 * @param {IZipEntry} entry The zip entry to validate
 */
function validateZipSymlink( entry: AdmZip.IZipEntry ) {
	if ( symlinkIgnorePattern.test( entry.entryName ) ) {
		return;
	}

	const madeBy = entry.header.made >> 8; // eslint-disable-line no-bitwise
	const errorMsg = errorMessages.symlink + entry.name;

	// DOS
	/* eslint-disable no-bitwise, eqeqeq */
	if ( madeBy === 0 && ( entry.attr & 0x0400 ) == 0x0400 ) {
		exit.withError( errorMsg );
	}

	// Unix
	if ( madeBy === 3 && ( ( entry.attr >>> 16 ) & constants.S_IFLNK ) === constants.S_IFLNK ) {
		/* eslint-enable no-bitwise, eqeqeq */
		exit.withError( errorMsg );
	}
}

/**
 * Validate a zip entry for disallowed characters and symlinks.
 * Ignores __MACOSX directories.
 *
 * @param {IZipEntry} entry The zip entry to validate
 */
function validateZipEntry( entry: AdmZip.IZipEntry ) {
	if ( entry.entryName.startsWith( macosxDir ) ) {
		return;
	}

	validateName( entry.isDirectory ? entry.entryName : entry.name, entry.isDirectory );
	validateZipSymlink( entry );
}

/**
 * Validate the existence of a themes directory in the root folder.
 *
 * @param {IZipEntry[]} zipEntries The zip entries to validate
 */
function validateZipThemes( rootFolder: string, zipEntries: AdmZip.IZipEntry[] ) {
	const hasThemesDir = zipEntries.some(
		entry => entry.isDirectory && entry.entryName.startsWith( path.join( rootFolder, 'themes/' ) )
	);

	if ( ! hasThemesDir ) {
		exit.withError( errorMessages.missingThemes );
	}
}

/**
 * Validate a zip file for Custom Deployments.
 *
 * @param {string} filePath The path to the zip file
 */
export function validateZipFile( filePath: string ) {
	try {
		const zipFile = new AdmZip( filePath );
		const zipEntries = zipFile.getEntries();

		const rootDirs = zipEntries.filter(
			entry =>
				entry.isDirectory &&
				! entry.entryName.startsWith( macosxDir ) &&
				( entry.entryName.match( /\//g ) || [] ).length === 1
		);
		if ( rootDirs.length !== 1 ) {
			exit.withError( errorMessages.singleRootDir );
		}

		const rootFolder = rootDirs[ 0 ].entryName;
		validateZipThemes( rootFolder, zipEntries );

		zipEntries.forEach( entry => validateZipEntry( entry ) );
	} catch ( error ) {
		const err = error as Error;
		exit.withError( `Error reading file: ${ err.message }` );
	}
}

/**
 * Validate the existence of a themes directory in the root folder in a tar file.
 *
 * @param {string} rootFolder The root folder of the tar file
 * @param {TarEntry[]} tarEntries The list of tar entries
 */
function validateTarThemes( rootFolder: string, tarEntries: TarEntry[] ) {
	const themesFolderPath = path.join( rootFolder, 'themes/' );
	const themesFolderExists = tarEntries.some(
		entry => entry.path === themesFolderPath && entry.type === 'Directory'
	);

	if ( ! themesFolderExists ) {
		exit.withError( errorMessages.missingThemes );
	}
}

/**
 * Validate a tar entry for disallowed characters and symlinks.
 *
 * @param {TarEntry} entry The tar entry to validate
 */
function validateTarEntry( entry: TarEntry ) {
	if ( entry.path.startsWith( macosxDir ) ) {
		return;
	}

	validateTarSymlink( entry );
	validateName( path.basename( entry.path ), entry.type === 'Directory' );
}

/**
 * Validate the existence of a symlink in a tar file. Ignores symlinks in node_modules/.bin/
 *
 * @param {TarEntry} entry The tar entry to validate for symlinks
 */
function validateTarSymlink( entry: TarEntry ) {
	if ( symlinkIgnorePattern.test( entry.path ) ) {
		return;
	}

	if ( entry.type === 'SymbolicLink' ) {
		exit.withError( errorMessages.symlink + entry.path );
	}
}

/**
 * Validate a tar file for Custom Deployments.
 *
 * @param {string} filePath The path to the tar file
 */
export async function validateTarFile( filePath: string ) {
	const tarEntries: TarEntry[] = [];
	let rootFolder: string | null = null;

	try {
		await tar.list( {
			file: filePath,
			onReadEntry: entry => {
				if ( entry.path.startsWith( macosxDir ) ) {
					return;
				}

				if (
					entry.type !== 'File' &&
					entry.type !== 'Directory' &&
					entry.type !== 'SymbolicLink'
				) {
					return;
				}

				const isRootFolder =
					entry.type === 'Directory' &&
					entry.path.endsWith( '/' ) &&
					( entry.path.match( /\//g ) || [] ).length === 1;

				if ( isRootFolder ) {
					if ( rootFolder === null ) {
						rootFolder = entry.path;
					} else if ( rootFolder !== entry.path ) {
						exit.withError( errorMessages.singleRootDir );
					}
				}

				const entryInfo: TarEntry = {
					path: entry.path,
					type: entry.type,
					mode: entry.mode,
				};
				validateTarEntry( entryInfo );
				tarEntries.push( entryInfo );
			},
		} );

		if ( ! rootFolder ) {
			exit.withError( errorMessages.singleRootDir );
		}

		validateTarThemes( rootFolder, tarEntries );
	} catch ( error ) {
		const err = error as Error;
		exit.withError( err.message );
	}
}
