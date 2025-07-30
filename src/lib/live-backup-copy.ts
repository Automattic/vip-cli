import fs from 'fs';
import gql from 'graphql-tag';
import https from 'https';
import path from 'path';

import {
	GenerateLiveBackupCopyDownloadUrlMutation,
	GenerateLiveBackupCopyDownloadUrlMutationVariables,
	StartLiveBackupCopyMutation,
	StartLiveBackupCopyMutationVariables,
} from './live-backup-copy.generated';
import API from '../lib/api';

export const START_LIVE_COPY_MUTATION = gql( `
	mutation startLiveBackupCopy($input: LiveBackupCopyConfigInput!) {
		startLiveBackupCopy(input: $input) {
			message
			copyId
		}
	}
` );

export const GENERATE_LIVE_BACKUP_DOWNLOAD_URL_MUTATION = gql( `
	mutation generateLiveBackupCopyDownloadURL(
		$input: AppEnvironmentLiveBackupCopyDownloadURLInput!
	) {
		generateLiveBackupCopyDownloadURL(input: $input) {
			success
			url
			processing
		}
	}
` );

export enum BackupLiveCopyType {
	FULL = 'full',
	TABLES = 'tables',
	SUBSITE_IDS = 'subsite_ids',
	WP_CLI_COMMAND = 'wpcli_command',
}

export enum SQLDumpTool {
	MYSQLDUMP = 'mysqldump',
	MYDUMPER = 'mydumper',
}

export interface DBLiveCopyConfig {
	tool: SQLDumpTool;
	type: BackupLiveCopyType;
	tables?: Record< string, Record< string, string | boolean > >;
	subsite_ids?: number[];
	wpcli_command?: string;
}

export async function startLiveBackupCopy( {
	appId,
	environmentId,
	config,
}: {
	appId: number;
	environmentId: number;
	config: DBLiveCopyConfig;
} ): Promise< string > {
	const api = API( { exitOnError: true } );

	const tables = config.tables
		? Object.entries( config.tables ).map( ( [ table, options ] ) => {
				const opts = Object.entries( options ).map( ( [ key, value ] ) => ( {
					key,
					value: value.toString(),
				} ) );
				return opts.length ? { table, options: opts } : { table };
		  } )
		: undefined;

	const result = await api.mutate<
		StartLiveBackupCopyMutation,
		StartLiveBackupCopyMutationVariables
	>( {
		mutation: START_LIVE_COPY_MUTATION,
		variables: {
			input: {
				id: appId,
				tool: SQLDumpTool.MYSQLDUMP,
				environmentId,
				tables,
				type: config.type,
				subsiteIds: config.subsite_ids,
				wpcliCommand: config.wpcli_command,
			},
		},
	} );

	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	if ( ! result.data?.startLiveBackupCopy.copyId ) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		throw new Error(
			`Failed to start live backup copy: ${
				result.data?.startLiveBackupCopy?.message
					? result.data?.startLiveBackupCopy?.message
					: 'Unkown error'
			}`
		);
	}

	return result.data?.startLiveBackupCopy.copyId;
}

export async function getDownloadURL( {
	appId,
	environmentId,
	copyId,
	timeoutInSeconds = 60 * 60,
}: {
	appId: number;
	environmentId: number;
	copyId: string;
	timeoutInSeconds?: number;
} ): Promise< string > {
	const startTime = Date.now();
	const timeoutMs = timeoutInSeconds * 1000;

	const api = API( { exitOnError: true } );

	while ( Date.now() - startTime < timeoutMs ) {
		// eslint-disable-next-line no-await-in-loop
		const result = await api.mutate<
			GenerateLiveBackupCopyDownloadUrlMutation,
			GenerateLiveBackupCopyDownloadUrlMutationVariables
		>( {
			mutation: GENERATE_LIVE_BACKUP_DOWNLOAD_URL_MUTATION,
			variables: {
				input: {
					id: appId,
					environmentId,
					copyId,
				},
			},
		} );

		if (
			result.data?.generateLiveBackupCopyDownloadURL?.url &&
			! result.data?.generateLiveBackupCopyDownloadURL?.processing
		) {
			return result.data.generateLiveBackupCopyDownloadURL.url;
		}

		if ( ! result.data?.generateLiveBackupCopyDownloadURL?.success ) {
			throw new Error(
				`Failed to generate download URL: ${
					result.data?.generateLiveBackupCopyDownloadURL?.url
						? result.data?.generateLiveBackupCopyDownloadURL?.url
						: 'Unknown error'
				}`
			);
		}

		if ( result.data?.generateLiveBackupCopyDownloadURL?.processing === true ) {
			await new Promise( resolve => setTimeout( resolve, 5000 ) );
		}
	}

	throw new Error( `Timeout: Download URL not generated within ${ timeoutInSeconds } seconds` );
}

export async function downloadFile( url: string, filename: string ) {
	const file = fs.createWriteStream( filename );

	return new Promise< string >( ( resolve, reject ) => {
		https.get( url, response => {
			response.pipe( file );

			file.on( 'finish', () => {
				file.close();
				resolve( path.resolve( file.path as string ) );
			} );

			file.on( 'error', err => {
				// TODO: fs.unlink runs in the background so there's a chance that the app dies before it finishes.
				//  This needs fixing.
				fs.unlink( filename, () => null );
				reject( err );
			} );
		} );
	} );
}
