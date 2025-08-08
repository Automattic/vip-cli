import gql from 'graphql-tag';

import {
	GenerateLiveBackupCopyDownloadUrlMutation,
	GenerateLiveBackupCopyDownloadUrlMutationVariables,
	StartLiveBackupCopyMutation,
	StartLiveBackupCopyMutationVariables,
} from './live-backup-copy.generated';
import UserError from './user-error';
import { PollingTimeoutError, pollUntil } from './utils';
import API from '../lib/api';

export interface LiveBackupCopyCLIOptions {
	useLiveBackupCopy?: boolean;
	subsiteIds?: number[];
	tables?: string[];
	wpcliCommand?: string;
	configFile?: string;
}

export function parseLiveBackupCopyCLIOptions(
	configFile?: string,
	table?: string | string[],
	subsiteId?: number | number[],
	wpcliCommand?: string
): LiveBackupCopyCLIOptions {
	const options: LiveBackupCopyCLIOptions = {};

	if ( configFile && ( table || subsiteId || wpcliCommand ) ) {
		throw new UserError(
			'The --config-file option cannot be used with the --table, --subsite-id, or --wpcli-command options. Please use only one of these options at a time.'
		);
	}

	if ( wpcliCommand && ( table || subsiteId ) ) {
		throw new UserError(
			'The --wpcli-command option cannot be used with the --table or --subsite-id options. Please use only one of these options at a time.'
		);
	}

	let useLiveBackupCopy = false;

	if ( table ) {
		if ( Array.isArray( table ) ) {
			options.tables = table.flatMap( t => t.split( ',' ).map( name => name.trim() ) );
		} else {
			options.tables = table.split( ',' ).map( name => name.trim() );
		}
		useLiveBackupCopy = true;
	}

	if ( subsiteId ) {
		if ( Array.isArray( subsiteId ) ) {
			options.subsiteIds = subsiteId.flatMap( id =>
				String( id )
					.split( ',' )
					.map( idStr => Number( idStr.trim() ) )
			);
		} else {
			options.subsiteIds = String( subsiteId )
				.split( ',' )
				.map( idStr => Number( idStr.trim() ) );
		}
		useLiveBackupCopy = true;
	}

	if ( configFile ) {
		options.configFile = configFile;
		useLiveBackupCopy = true;
	}

	if ( wpcliCommand ) {
		options.wpcliCommand = wpcliCommand;
		useLiveBackupCopy = true;
	}

	return {
		...options,
		useLiveBackupCopy,
	};
}

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
	tool?: SQLDumpTool;
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
