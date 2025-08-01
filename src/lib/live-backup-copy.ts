import gql from 'graphql-tag';

import {
	GenerateLiveBackupCopyDownloadUrlMutation,
	GenerateLiveBackupCopyDownloadUrlMutationVariables,
	StartLiveBackupCopyMutation,
	StartLiveBackupCopyMutationVariables,
} from './live-backup-copy.generated';
import { PollingTimeoutError, pollUntil } from './utils';
import API from '../lib/api';

export const START_LIVE_COPY_MUTATION = gql( `
	mutation startLiveBackupCopy($input: LiveBackupCopyConfigInput!) {
		startLiveBackupCopy(input: $input) {
			message
			copyId
		}
	}
` );

// eslint-disable-next-line id-length
export const GENERATE_LIVE_BACKUP_DOWNLOAD_URL_MUTATION = gql( `
	mutation generateLiveBackupCopyDownloadURL(
		$input: AppEnvironmentLiveBackupCopyDownloadURLInput!
	) {
		generateLiveBackupCopyDownloadURL(input: $input) {
			success
			url
			processing
			size
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

	const result = await api.mutate<
		StartLiveBackupCopyMutation,
		StartLiveBackupCopyMutationVariables
	>( {
		mutation: START_LIVE_COPY_MUTATION,
		variables: {
			input: {
				id: appId,
				environmentId,
				config,
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
					: 'Unknown error'
			}`
		);
	}

	return result.data?.startLiveBackupCopy.copyId;
}

export async function getDownloadURL( {
	appId,
	environmentId,
	copyId,
	timeoutInSeconds = 2 * 60 * 60, // 2 hours default timeout
}: {
	appId: number;
	environmentId: number;
	copyId: string;
	timeoutInSeconds?: number;
} ) {
	const api = API( { exitOnError: true } );

	try {
		const result = await pollUntil(
			async () => {
				return await api.mutate<
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
			},
			5000,
			fetchResult => {
				return Boolean(
					fetchResult.data?.generateLiveBackupCopyDownloadURL?.url &&
						! fetchResult.data?.generateLiveBackupCopyDownloadURL?.processing
				);
			},
			timeoutInSeconds * 1000
		);

		if (
			! result.data?.generateLiveBackupCopyDownloadURL?.success ||
			! result.data.generateLiveBackupCopyDownloadURL.url ||
			! result.data.generateLiveBackupCopyDownloadURL.size
		) {
			throw new Error(
				`Failed to generate download URL: ${
					result.data?.generateLiveBackupCopyDownloadURL?.url
						? result.data?.generateLiveBackupCopyDownloadURL?.url
						: 'Unknown error'
				}`
			);
		}

		return {
			url: result.data.generateLiveBackupCopyDownloadURL.url,
			size: result.data.generateLiveBackupCopyDownloadURL.size,
		};
	} catch ( error ) {
		if ( error instanceof PollingTimeoutError ) {
			throw new Error(
				`Failed to generate download URL: Polling timed out after ${ timeoutInSeconds } seconds`
			);
		}

		const errorMessage = error instanceof Error ? error.message : JSON.stringify( error );
		throw new Error( `Failed to generate download URL: ${ errorMessage }` );
	}
}
