import gql from 'graphql-tag';

import API from '../../lib/api';
import http from './http';

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
 */
export async function getDefensiveMode(
	appId: number,
	envId: number
): Promise< DefensiveModeResponse > {
	const path = `/v1/sites/${ envId }/defensive-mode`;
	const response = await http( path, { method: 'GET' } );

	if ( ! response.ok ) {
		const errorData = ( await response.json() ) as { message?: string };
		throw new Error( errorData.message || `Failed to get defensive mode status` );
	}

	return ( await response.json() ) as DefensiveModeResponse;
}

/**
 * Update Defensive Mode configuration for an environment
 */
export async function updateDefensiveMode(
	appId: number,
	envId: number,
	config: Partial< DefensiveModeConfig >
): Promise< DefensiveModeResponse > {
	const path = `/v1/sites/${ envId }/defensive-mode`;
	const response = await http( path, {
		method: 'PATCH',
		body: config,
	} );

	if ( ! response.ok ) {
		const errorData = ( await response.json() ) as { message?: string; code?: string };
		if ( errorData.code === 'permission_denied' ) {
			throw new Error(
				'Insufficient permissions to manage Defensive Mode. Required role: Org Admin or App Admin'
			);
		}
		throw new Error( errorData.message || `Failed to update defensive mode configuration` );
	}

	return ( await response.json() ) as DefensiveModeResponse;
}

/**
 * Enable Defensive Mode for an environment
 */
export async function enableDefensiveMode(
	appId: number,
	envId: number
): Promise< DefensiveModeResponse > {
	return updateDefensiveMode( appId, envId, { enabled: true } );
}

/**
 * Disable Defensive Mode for an environment
 */
export async function disableDefensiveMode(
	appId: number,
	envId: number
): Promise< DefensiveModeResponse > {
	return updateDefensiveMode( appId, envId, { enabled: false } );
}
