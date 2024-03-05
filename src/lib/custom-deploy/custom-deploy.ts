import fs from 'fs';
import gql from 'graphql-tag';

import { App, AppEnvironment } from '../../graphqlTypes';
import API from '../../lib/api';
import * as exit from '../../lib/cli/exit';
import { checkFileAccess, getFileSize, isFile, FileMeta } from '../../lib/client-file-uploader';
import { GB_IN_BYTES } from '../../lib/constants/file-size';
import { WORDPRESS_SITE_TYPE_IDS } from '../../lib/constants/vipgo';
import { trackEventWithEnv } from '../../lib/tracker';
import { validateDeployFileExt, validateFilename } from '../../lib/validations/custom-deploy';

const DEPLOY_MAX_FILE_SIZE = 4 * GB_IN_BYTES;

export function isSupportedApp( app: App ): boolean {
	return WORDPRESS_SITE_TYPE_IDS.includes( app.typeId as number );
}

export async function validateCustomDeployKey(
	customDeployKey: string,
	envId: number
): Promise< void > {
	if ( customDeployKey.length === 0 ) {
		exit.withError( 'Valid custom deploy key is required.' );
	}

	const VALIDATE_CUSTOM_DEPLOY_ACCESS_MUTATION = gql`
	mutation ValidateCustomDeployAccess {
		validateCustomDeployAccess( input: { environmentIds: ${ envId } } ) {
			success
		}
	}
`;

	const api = await API( { customAuthToken: customDeployKey } );
	try {
		await api.mutate( { mutation: VALIDATE_CUSTOM_DEPLOY_ACCESS_MUTATION } );
	} catch ( error ) {
		exit.withError(
			`Unauthorized: Invalid or non-existent custom deploy key for environment ${ envId }.`
		);
	}
}

/**
 * @param {FileMeta} fileMeta
 */
export async function gates( app: App, env: AppEnvironment, fileMeta: FileMeta ) {
	const { fileName, basename, isCompressed } = fileMeta;
	const appId = env.appId as number;
	const envId = env.id as number;
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
