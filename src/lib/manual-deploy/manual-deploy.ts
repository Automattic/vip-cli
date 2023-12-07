import fs from 'fs';
import { mkdtemp } from 'node:fs/promises';
import os from 'os';
import path from 'path';

import { App, AppEnvironment } from '../../graphqlTypes';
import * as exit from '../../lib/cli/exit';
import { checkFileAccess, getFileSize, isFile, FileMeta } from '../../lib/client-file-uploader';
import { GB_IN_BYTES } from '../../lib/constants/file-size';
import { WORDPRESS_SITE_TYPE_IDS } from '../../lib/constants/vipgo';
import { trackEventWithEnv } from '../../lib/tracker';
import { validateDeployFileExt, validateFilename } from '../../lib/validations/manual-deploy';

export function currentUserCanDeployForApp( app: App ): boolean {
	// TODO: implement
	return Boolean( app );
}

export function isSupportedApp( app: App ): boolean {
	return WORDPRESS_SITE_TYPE_IDS.includes( app.typeId as number );
}

/**
 * @param {FileMeta} fileMeta
 */
export async function gates( app: App, env: AppEnvironment, fileMeta: FileMeta ) {
	const { fileName, basename } = fileMeta;
	const appId = env.appId as number;
	const envId = env.id as number;
	const track = trackEventWithEnv.bind( null, appId, envId );

	if ( ! fs.existsSync( fileName ) ) {
		await track( 'deploy_app_command_error', { error_type: 'invalid-file' } );
		exit.withError( `Unable to access file ${ fileMeta.fileName }` );
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

	if ( ! currentUserCanDeployForApp( app ) ) {
		await track( 'deploy_app_command_error', { error_type: 'unauthorized' } );
		exit.withError(
			'The currently authenticated account does not have permission to deploy to an application.'
		);
	}

	if ( ! isSupportedApp( app ) ) {
		await track( 'deploy_app_command_error', { error_type: 'unsupported-app' } );
		exit.withError( 'The type of application you specified does not currently support deploys.' );
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

	const maxFileSize = 4 * GB_IN_BYTES;
	if ( fileSize > maxFileSize ) {
		await track( 'deploy_app_command_error', {
			error_type: 'appfile-toobig',
			file_size: fileSize,
		} );
		exit.withError(
			`The deploy file size (${ fileSize } bytes) exceeds the limit (${ maxFileSize } bytes).`
		);
	}
}

/**
 * Rename file so it doesn't get overwritten.
 * @param {FileMeta} fileMeta - The metadata of the file to be renamed.
 * @returns {FileMeta} The updated file metadata after renaming.
 */
export async function renameFile( fileMeta: FileMeta ) {
	const tmpDir = await mkdtemp( path.join( os.tmpdir(), 'vip-manual-deploys' ) );

	const datePrefix = new Date()
		.toISOString()
		// eslint-disable-next-line no-useless-escape
		.replace( /[\-T:\.Z]/g, '' )
		.slice( 0, 14 );
	const newFileBasename = `${ datePrefix }-${ fileMeta.basename }`;
	const newFileName = `${ tmpDir }/${ newFileBasename }`;

	fs.copyFileSync( fileMeta.fileName, newFileName );
	fileMeta.fileName = newFileName;
	fileMeta.basename = newFileBasename;

	return fileMeta;
}
