import fs from 'fs';
import gql from 'graphql-tag';
import debugLib from 'debug';

import API from '../../lib/api';
import * as exit from '../../lib/cli/exit';
import { checkFileAccess, getFileSize, isFile, FileMeta } from '../../lib/client-file-uploader';
import { GB_IN_BYTES } from '../../lib/constants/file-size';
import { trackEventWithEnv } from '../../lib/tracker';
import { validateDeployFileExt, validateFilename } from '../../lib/validations/custom-deploy';

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

