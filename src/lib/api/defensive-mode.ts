import gql from 'graphql-tag';

import API from '../../lib/api';

// GraphQL query for app and environment data
export const appQuery = `
	id
	name
	environments {
		id
		appId
		name
		primaryDomain {
			name
		}
		type
		defensiveMode {
			config {
				stored {
					enabled
					disableAtEpoch
					connectionThresholdPercentage
					connectionThresholdAbsolute
					keepEnabledUnderThresholdForSeconds
					challengeType
					maxRequestRate
					priorityBypass
				}
				effective {
					enabled
					disableAtEpoch
					connectionThresholdPercentage
					connectionThresholdAbsolute
					keepEnabledUnderThresholdForSeconds
					challengeType
					maxRequestRate
					priorityBypass
				}
			}
		}
	}
`;

// Types for Defensive Mode configuration
export interface DefensiveModeConfig {
	enabled: boolean;
	disableAtEpoch?: number;
	connectionThresholdPercentage?: number;
	connectionThresholdAbsolute?: number;
	keepEnabledUnderThresholdForSeconds?: number;
	challengeType?: number;
	maxRequestRate?: number;
	priorityBypass?: number;
}

export interface DefensiveModeResponse {
	data: {
		stored: DefensiveModeConfig | null;
		effective: DefensiveModeConfig;
		statusUpdated?: boolean;
		configUpdated?: boolean;
		updates?: Record< string, { from: unknown; to: unknown } >;
	};
	status: string;
}

/**
 * Get current Defensive Mode configuration for an environment
 * Note: Data is fetched via appQuery and passed through opt.env.defensiveMode
 */
export async function getDefensiveMode(
	appId: number,
	envId: number,
	envData?: any
): Promise< DefensiveModeResponse > {
	// If defensiveMode data was already loaded via appQuery, use it
	if ( envData?.defensiveMode?.config ) {
		return {
			data: envData.defensiveMode.config,
			status: 'success',
		};
	}

	// Otherwise, query GraphQL directly
	const query = gql`
		query GetDefensiveMode($appId: Int!, $envId: Int!) {
			app(id: $appId) {
				environments(id: $envId) {
					defensiveMode {
						config {
							stored {
								enabled
								disableAtEpoch
								connectionThresholdPercentage
								connectionThresholdAbsolute
								keepEnabledUnderThresholdForSeconds
								challengeType
								maxRequestRate
								priorityBypass
							}
							effective {
								enabled
								disableAtEpoch
								connectionThresholdPercentage
								connectionThresholdAbsolute
								keepEnabledUnderThresholdForSeconds
								challengeType
								maxRequestRate
								priorityBypass
							}
						}
					}
				}
			}
		}
	`;

	const api = API();
	const response = await api.query( {
		query,
		variables: { appId, envId },
	} );

	if ( ! response.data?.app?.environments?.[ 0 ]?.defensiveMode ) {
		throw new Error( 'Failed to get defensive mode status' );
	}

	return {
		data: response.data.app.environments[ 0 ].defensiveMode.config,
		status: 'success',
	};
}

/**
 * Update Defensive Mode configuration for an environment
 */
export async function updateDefensiveMode(
	appId: number,
	envId: number,
	config: Partial< DefensiveModeConfig >
): Promise< DefensiveModeResponse > {
	const mutation = gql`
		mutation UpdateDefensiveModeConfig($input: AppEnvironmentDefensiveModeConfigInput!) {
			updateDefensiveModeConfig(input: $input) {
				success
				message
			}
		}
	`;

	const api = API();
	const response = await api.mutate( {
		mutation,
		variables: {
			input: {
				id: appId,
				environmentId: envId,
				...config,
			},
		},
	} );

	if ( ! response.data?.updateDefensiveModeConfig?.success ) {
		const message =
			response.data?.updateDefensiveModeConfig?.message || 'Failed to update defensive mode';
		if ( message.includes( 'permission' ) ) {
			throw new Error(
				'Insufficient permissions to manage Defensive Mode. Required role: Org Admin or App Admin'
			);
		}
		throw new Error( message );
	}

	// Query for updated config
	const updatedConfig = await getDefensiveMode( appId, envId );

	// Calculate if status was updated
	const statusUpdated = config.enabled !== undefined;

	return {
		data: {
			statusUpdated,
			configUpdated: true,
			stored: updatedConfig.data.stored,
			effective: updatedConfig.data.effective,
		},
		status: 'success',
	};
}

/**
 * Enable Defensive Mode for an environment
 */
export async function enableDefensiveMode(
	appId: number,
	envId: number
): Promise< DefensiveModeResponse > {
	const mutation = gql`
		mutation UpdateDefensiveModeStatus($input: AppEnvironmentDefensiveModeUpdateStatusInput!) {
			updateDefensiveModeStatus(input: $input) {
				success
				message
			}
		}
	`;

	const api = API();
	const response = await api.mutate( {
		mutation,
		variables: {
			input: {
				id: appId,
				environmentId: envId,
				enabled: true,
			},
		},
	} );

	if ( ! response.data?.updateDefensiveModeStatus?.success ) {
		const message =
			response.data?.updateDefensiveModeStatus?.message || 'Failed to enable defensive mode';
		if ( message.includes( 'permission' ) ) {
			throw new Error(
				'Insufficient permissions to manage Defensive Mode. Required role: Org Admin or App Admin'
			);
		}
		throw new Error( message );
	}

	// Query for updated config
	const updatedConfig = await getDefensiveMode( appId, envId );

	return {
		data: {
			statusUpdated: true,
			configUpdated: false,
			stored: updatedConfig.data.stored,
			effective: updatedConfig.data.effective,
		},
		status: 'success',
	};
}

/**
 * Disable Defensive Mode for an environment
 */
export async function disableDefensiveMode(
	appId: number,
	envId: number
): Promise< DefensiveModeResponse > {
	const mutation = gql`
		mutation UpdateDefensiveModeStatus($input: AppEnvironmentDefensiveModeUpdateStatusInput!) {
			updateDefensiveModeStatus(input: $input) {
				success
				message
			}
		}
	`;

	const api = API();
	const response = await api.mutate( {
		mutation,
		variables: {
			input: {
				id: appId,
				environmentId: envId,
				enabled: false,
			},
		},
	} );

	if ( ! response.data?.updateDefensiveModeStatus?.success ) {
		const message =
			response.data?.updateDefensiveModeStatus?.message || 'Failed to disable defensive mode';
		if ( message.includes( 'permission' ) ) {
			throw new Error(
				'Insufficient permissions to manage Defensive Mode. Required role: Org Admin or App Admin'
			);
		}
		throw new Error( message );
	}

	// Query for updated config
	const updatedConfig = await getDefensiveMode( appId, envId );

	return {
		data: {
			statusUpdated: true,
			configUpdated: false,
			stored: updatedConfig.data.stored,
			effective: updatedConfig.data.effective,
		},
		status: 'success',
	};
}
