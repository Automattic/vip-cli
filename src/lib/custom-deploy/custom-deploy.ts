import fs from 'fs';
import gql from 'graphql-tag';
import zlib from 'zlib';
import { join, extname } from 'path';
import extract from 'extract-zip';
import { exec } from 'child_process';
import debugLib from 'debug';

import API from '../../lib/api';
import * as exit from '../../lib/cli/exit';
import { checkFileAccess, getFileSize, isFile, FileMeta } from '../../lib/client-file-uploader';
import { GB_IN_BYTES } from '../../lib/constants/file-size';
import { trackEventWithEnv } from '../../lib/tracker';
import { validateDeployFileExt, validateFilename } from '../../lib/validations/custom-deploy';
import { makeTempDir } from '../../lib/utils';

const debug = debugLib( '@automattic/vip:bin:lib-custom-deploy' );

const DEPLOY_MAX_FILE_SIZE = 4 * GB_IN_BYTES;
const WPVIP_DEPLOY_TOKEN = process.env.WPVIP_DEPLOY_TOKEN;

type CustomDeployInfo = {
	success: boolean;
	appId: number;
	envId: number;
	envType: string;
	envUniqueLabel: string;
	primaryDomainName: string;
	launched: boolean;
};

type ValidateMutationPayload = {
	data?: {
		validateCustomDeployAccess: CustomDeployInfo;
	} | null;
};

export async function validateCustomDeployKey(
	app: string | number,
	env: string | number
): Promise< CustomDeployInfo > {
	if ( ! WPVIP_DEPLOY_TOKEN ) {
		exit.withError( 'Valid custom deploy key is required.' );
	}

	const VALIDATE_CUSTOM_DEPLOY_ACCESS_MUTATION = gql`
	mutation ValidateCustomDeployAccess {
		validateCustomDeployAccess( input: { app: "${ String( app ) }", env: "${ String( env ) }" } ) {
			success,
			appId,
			envId,
			envType,
			envUniqueLabel,
			primaryDomainName,
			launched
		}
	}
`;

	const api = API( { exitOnError: true } );
	try {
		const result: ValidateMutationPayload = await api.mutate( {
			mutation: VALIDATE_CUSTOM_DEPLOY_ACCESS_MUTATION,
			context: {
				headers: {
					Authorization: `Bearer ${ WPVIP_DEPLOY_TOKEN }`,
				},
			},
		} );

		if ( ! result.data?.validateCustomDeployAccess ) {
			throw new Error( 'Not found' );
		}

		return result.data?.validateCustomDeployAccess;
	} catch ( error ) {
		exit.withError( `Unauthorized: Invalid or non-existent custom deploy key for environment.` );
	}
}

/**
 * @param {FileMeta} fileMeta
 */
export async function validateFile( appId: number, envId: number, fileMeta: FileMeta ) {
	const { fileName, basename, isCompressed } = fileMeta;
	const track = trackEventWithEnv.bind( null, appId, envId );

	if ( ! fs.existsSync( fileName ) ) {
		await track( 'deploy_app_command_error', { error_type: 'invalid-file' } );
		exit.withError( `Unable to access file ${ fileMeta.fileName }` );
	}

	if ( ! isCompressed ) {
		await track( 'deploy_app_command_error', { error_type: 'uncompressed-file' } );
		exit.withError( `Please compress file ${ fileMeta.fileName } before uploading.` );
	}

	try {
		validateFilename( basename );
	} catch ( error ) {
		await track( 'deploy_app_command_error', { error_type: 'invalid-filename' } );
		exit.withError( error as Error );
	}

	try {
		validateDeployFileExt( fileName );
	} catch ( error ) {
		await track( 'deploy_app_command_error', { error_type: 'invalid-extension' } );
		exit.withError( error as Error );
	}

	try {
		await checkFileAccess( fileName );
	} catch ( err ) {
		await track( 'deploy_app_command_error', { error_type: 'appfile-unreadable' } );
		exit.withError( `File '${ fileName }' does not exist or is not readable.` );
	}

	if ( ! ( await isFile( fileName ) ) ) {
		await track( 'deploy_app_command_error', { error_type: 'appfile-notfile' } );
		exit.withError( `Path '${ fileName }' is not a file.` );
	}

	const fileSize = await getFileSize( fileName );
	if ( ! fileSize ) {
		await track( 'deploy_app_command_error', { error_type: 'appfile-empty' } );
		exit.withError( `File '${ fileName }' is empty.` );
	}

	if ( fileSize > DEPLOY_MAX_FILE_SIZE ) {
		await track( 'deploy_app_command_error', {
			error_type: 'appfile-toobig',
			file_size: fileSize,
		} );
		exit.withError(
			`The deploy file size (${ fileSize } bytes) exceeds the limit (${ DEPLOY_MAX_FILE_SIZE } bytes).`
		);
	}
}

/**
 * Extracts the compressed file to a temporary directory
 *
 * @param {string} file The compressed file
 * @returns {string} The path to the temporary directory
 */
export async function extractFile( file: string ): Promise< string > {
	const tempDir = makeTempDir( 'custom-deploy' );
	const ext = extname( file );

	if ( ext === '.zip' ) {
		try {
			await extract( file, { dir: tempDir } );
		} catch ( error ) {
			exit.withError( `Error extracting file: ${ error }` );
		}
	} else {
		// .tar.gz, .tgz files
		try {
			await new Promise< void >( ( resolve, reject ) => {
				const tarProcess = exec( `tar -xz -C ${ tempDir }`, ( err, stdout, stderr ) => {
					if ( err ) {
						reject( err );
					} else {
						console.log( `Decompressed and untarred to: ${ tempDir }` );
						resolve();
					}
				} );

				if ( tarProcess.stdin ) {
					fs.createReadStream( file )
						.pipe( zlib.createGunzip() )
						.pipe( tarProcess.stdin )
						.on( 'error', reject );
				} else {
					reject( new Error( 'Failed to create tar process stdin stream' ) );
				}
			} );
		} catch ( error ) {
			exit.withError( `Error decompressing and extracting file: ${ error }` );
		}
	}

	return tempDir;
}

/**
 * Recursively remove unwanted items from the directory
 *
 * @param {string} directory The directory to clean
 * @param {string[]} files The files in the directory
 */
function rmUnneededItems( directory: string, files: string[] ) {
	const itemsToRm = [
		'__MACOSX',
		'.DS_Store',
		'Thumbs.db',
		'desktop.ini',
		'.Spotlight-V100',
		'.Trashes',
		'.fseventsd',
		'.apdisk',
		'.TemporaryItems',
	];

	for ( const file of files ) {
		const filePath = `${ directory }/${ file }`;

		if ( itemsToRm.includes( file ) ) {
			debug( `Removing unwanted item: ${ filePath }` );
			fs.rmSync( filePath, { recursive: true, force: true } );
		} else {
			const stats = fs.statSync( filePath );
			if ( stats.isDirectory() ) {
				const nestedFiles = fs.readdirSync( filePath );
				rmUnneededItems( filePath, nestedFiles );
			}
		}
	}
}

/**
 * Recursively checks if the directory contains any dangerous filenames or symlinks.
 *
 * @param {string} directory The directory to validate
 * @param {string} items The items in the directory
 */
function validateDirContentsRecursively( directory: string, items: string[] ) {
	for ( const itemName of items ) {
		const itemPath = join( directory, itemName );

		if (
			/[!/:*?"<>|']/.test( itemName ) ||
			( itemName.startsWith( '.' ) && itemName.length > 1 )
		) {
			exit.withError( `Error: Dangerous filename detected: ${ itemName }` );
		}

		const stats = fs.lstatSync( itemPath );
		if ( stats.isSymbolicLink() ) {
			exit.withError( `Error: Symlink detected: ${ itemName }` );
		}

		// If the item is a directory, recursively validate its contents
		if ( stats.isDirectory() ) {
			// Skip node_modules and its .bin subdirectory
			if ( itemPath.includes( 'node_modules' ) && itemPath.includes( '.bin' ) ) {
				continue;
			}

			const recursiveItems = fs.readdirSync( itemPath );
			validateDirContentsRecursively( itemPath, recursiveItems );
		}
	}
}

function validateRootFolder( directory: string, folder: string ) {
	const path = join( directory, folder );
	const stats = fs.statSync( path );
	if ( ! stats.isDirectory() ) {
		exit.withError( 'The compressed file should have a root folder.' );
	}

	const rootFolderContents = fs.readdirSync( path );
	if ( ! rootFolderContents.includes( 'themes' ) ) {
		exit.withError( "The compressed file should contain a 'themes' folder." );
	}
}

export function validateDirectory( directory: string ) {
	const files = fs.readdirSync( directory );

	rmUnneededItems( directory, files );

	if ( files.length === 0 ) {
		exit.withError( 'The compressed file should contain at least one folder.' );
	} else if ( files.length !== 1 ) {
		exit.withError( 'The compressed file should contain only one folder.' );
	}

	validateDirContentsRecursively( directory, files );

	validateRootFolder( directory, files[ 0 ] );
}
