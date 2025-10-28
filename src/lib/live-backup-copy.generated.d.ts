import * as Types from '../graphqlTypes';

export type StartLiveBackupCopyMutationVariables = Types.Exact< {
	input: Types.LiveBackupCopyConfigInput;
} >;

export type StartLiveBackupCopyMutation = {
	__typename?: 'Mutation';
	startLiveBackupCopy: {
		__typename?: 'AppEnvironmentStartLiveBackupCopyPayload';
		message?: string | null;
		copyId?: string | null;
	};
};

export type GenerateLiveBackupCopyDownloadUrlMutationVariables = Types.Exact< {
	input: Types.AppEnvironmentLiveBackupCopyDownloadUrlInput;
} >;

export type GenerateLiveBackupCopyDownloadUrlMutation = {
	__typename?: 'Mutation';
	generateLiveBackupCopyDownloadURL?: {
		__typename?: 'AppEnvironmentLiveBackupCopyDownloadURLPayload';
		success: boolean;
		url?: string | null;
		processing: boolean;
		size?: any | null;
	} | null;
};
