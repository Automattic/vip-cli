import StreamZip, { ZipEntry } from 'node-stream-zip';
import { constants } from 'node:fs';
import path from 'path';
import * as tar from 'tar';

import * as exit from '../../lib/cli/exit';
import { MB_IN_BYTES } from '../../lib/constants/file-size';

interface TarEntry {
	path: string;
	type: string;
	mode: number | undefined;
	size?: number;
}

export interface LargeArchiveFile {
	path: string;
	size: number;
}

const errorMessages = {
	missingThemes: 'Missing `themes` directory from root folder.',
	symlink: 'Symlink detected: ',
	singleRootDir: 'The compressed file must contain a single root directory.',
	invalidExt: 'Invalid file extension. Please provide a .zip, .tar.gz, or a .tgz file.',
	invalidChars: ( filename: string, invalidChars: string ) =>
		`Filename ${ filename } contains disallowed characters: ${ invalidChars }`,
};
const symlinkIgnorePattern = /\/node_modules\/[^/]+\/\.bin\//;
const macosxDir = '__MACOSX';
export const LARGE_ARCHIVE_FILE_SIZE_LIMIT = 20 * MB_IN_BYTES;

function getDeployFileExt( filename: string ): string {
	const lower = filename.toLowerCase();

	if ( lower.endsWith( '.tar.gz' ) ) {
		return '.tar.gz';
	}

	if ( lower.endsWith( '.tgz' ) ) {
		return '.tgz';
	}

	if ( lower.endsWith( '.zip' ) ) {
		return '.zip';
	}

	return path.extname( lower );
}

function isDeployArchiveFile( filename: string ): boolean {
	return [ '.zip', '.tar.gz', '.tgz' ].includes( getDeployFileExt( filename ) );
}

async function findLargeArchiveFilesInZipArchive(
	filePath: string
): Promise< LargeArchiveFile[] > {
	const zipFile = new StreamZip.async( { file: filePath } );

	try {
		const zipEntries = await zipFile.entries();

		return Object.values( zipEntries )
			.filter(
				entry =>
					! entry.isDirectory &&
					isDeployArchiveFile( entry.name ) &&
					entry.size > LARGE_ARCHIVE_FILE_SIZE_LIMIT
			)
			.map( entry => ( {
				path: entry.name,
				size: entry.size,
			} ) );
	} finally {
		await zipFile.close();
	}
}

async function findLargeArchiveFilesInTarArchive(
	filePath: string
): Promise< LargeArchiveFile[] > {
	const largeArchiveFiles: LargeArchiveFile[] = [];

	await tar.list( {
		file: filePath,
		onReadEntry: entry => {
			if (
				entry.type === 'File' &&
				isDeployArchiveFile( entry.path ) &&
				entry.size > LARGE_ARCHIVE_FILE_SIZE_LIMIT
			) {
				largeArchiveFiles.push( {
					path: entry.path,
					size: entry.size,
				} );
			}
		},
	} );

	return largeArchiveFiles;
}

export async function findLargeArchiveFilesInDeployArchive(
	filePath: string
): Promise< LargeArchiveFile[] > {
	const ext = getDeployFileExt( filePath );

	if ( ext === '.zip' ) {
		return findLargeArchiveFilesInZipArchive( filePath );
	}

	if ( ext === '.tar.gz' || ext === '.tgz' ) {
		return findLargeArchiveFilesInTarArchive( filePath );
	}

	return [];
}

/**
 * Check if a file has a valid extension
 *
 * @param {string} filename The file extension
 * @returns {boolean} True if the extension is valid
 */
export function validateDeployFileExt( filename: string ): void {
	const ext = getDeployFileExt( filename );

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
 * @param {ZipEntry} entry The zip entry to validate
 */
function validateZipSymlink( entry: ZipEntry ) {
	if ( symlinkIgnorePattern.test( entry.name ) ) {
		return;
	}

	const madeBy = entry.verMade >> 8; // eslint-disable-line no-bitwise
	const errorMsg = errorMessages.symlink + entry.name;

	// DOS
	/* eslint-disable no-bitwise */
	if ( madeBy === 0 && ( entry.attr & 0x0400 ) === 0x0400 ) {
		exit.withError( errorMsg );
	}

	// Unix
	if ( madeBy === 3 && ( ( entry.attr >>> 16 ) & constants.S_IFLNK ) === constants.S_IFLNK ) {
		/* eslint-enable no-bitwise */
		exit.withError( errorMsg );
	}
}

/**
 * Validate a zip entry for disallowed characters and symlinks.
 * Ignores __MACOSX directories.
 *
 * @param {ZipEntry} entry The zip entry to validate
 */
function validateZipEntry( entry: ZipEntry ) {
	if ( entry.name.startsWith( macosxDir ) ) {
		return;
	}

	validateName( entry.isDirectory ? entry.name : path.basename( entry.name ), entry.isDirectory );
	validateZipSymlink( entry );
}

/**
 * Validate the existence of a themes directory in the root folder.
 *
 * @param rootFolder The root folder of the zip file
 * @param {ZipEntry[]} zipEntries The zip entries to validate
 */
function validateZipThemes( rootFolder: string, zipEntries: ZipEntry[] ) {
	const hasThemesDir = zipEntries.some( entry => {
		// Convert win32 path separators to posix path separators
		const posixPath = entry.name.replace( /\\/g, '/' );
		const requiredPosixPath = path.join( rootFolder, 'themes/' ).replace( /\\/g, '/' );

		return entry.isDirectory && posixPath.startsWith( requiredPosixPath );
	} );

	if ( ! hasThemesDir ) {
		exit.withError( errorMessages.missingThemes );
	}
}

/**
 * Validate a zip file for Custom Deployments.
 *
 * @param {string} filePath The path to the zip file
 */
export async function validateZipFile( filePath: string ) {
	try {
		const zipFile = new StreamZip.async( { file: filePath } );

		const zipEntries = await zipFile.entries();

		const rootDirs = Object.values( zipEntries ).filter(
			entry =>
				entry.isDirectory &&
				! entry.name.startsWith( macosxDir ) &&
				( entry.name.match( /\//g ) || [] ).length === 1
		);
		if ( rootDirs.length !== 1 ) {
			exit.withError( errorMessages.singleRootDir );
		}

		const rootFolder = rootDirs[ 0 ].name;
		validateZipThemes( rootFolder, Object.values( zipEntries ) );

		Object.values( zipEntries ).forEach( entry => validateZipEntry( entry ) );
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
