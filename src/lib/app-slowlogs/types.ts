export interface DefaultOptions {
	app: {
		id: number;
		organization: {
			id: number;
			name: string;
		};
	};
	env: {
		id: number;
	};
}

export type SlowlogFormats = 'json' | 'csv' | 'table';

type Stringable = string | { toString: () => string };

export interface GetSlowLogsOptions extends DefaultOptions {
	limit: number;
	format: 'table' | 'json' | 'csv';
}

export interface GetRecentSlowlogsResponse {
	nodes: Slowlog[];
	nextCursor: string;
	pollingDelaySeconds: number;
}

export interface GetBaseTrackingParamsOptions extends DefaultOptions {
	limit: number;
	format: string;
	follow?: boolean;
}

export interface BaseTrackingParams extends Record< string, unknown > {
	command: string;
	org_id: number;
	app_id: number;
	env_id: number;
	limit: number;
	follow?: boolean;
	format: string;
}

export interface Slowlog extends Record< string, Stringable > {
	timestamp: string;
	rowsSent: string;
	rowsExamined: string;
	queryTime: string;
	requestUri: string;
	query: string;
}
