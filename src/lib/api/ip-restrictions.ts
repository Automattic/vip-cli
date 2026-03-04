import gql from 'graphql-tag';

import API from '../../lib/api';

// GraphQL query for app and environment data with IP restrictions
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
		edgeConfig {
			accessRestrictions {
				ip {
					action
					groups {
						id
						ips
						notes
						createdAt
						updatedAt
					}
				}
			}
		}
	}
	organization {
		id
		name
		salesforceId
	}
`;

// Types for IP Restrictions configuration
export interface IPRestrictionGroup {
	id?: string;
	ips: Array< string | null >;
	notes: string;
	createdAt?: string;
	updatedAt?: string;
}

export interface IPRestrictionsConfig {
	action: 'allow' | 'deny';
	groups: IPRestrictionGroup[];
}

export interface IPRestrictionsResponse {
	data: IPRestrictionsConfig;
	status: string;
}

// GraphQL response types
interface EdgeConfigAccessRestrictionsIP {
	action: 'allow' | 'deny';
	groups: IPRestrictionGroup[];
}

interface IPRestrictionsQueryResponse {
	app?: {
		environments?: Array< {
			edgeConfig?: {
				accessRestrictions?: {
					ip: EdgeConfigAccessRestrictionsIP;
				};
			};
		} >;
	};
}

interface UpdateIPAccessRestrictionsResponse {
	updateIPAccessRestrictions?: EdgeConfigAccessRestrictionsIP;
}

// Environment data type
interface EnvironmentData {
	edgeConfig?: {
		accessRestrictions?: {
			ip: EdgeConfigAccessRestrictionsIP;
		};
	};
}

/**
 * Get current IP Restrictions configuration for an environment
 * Note: Data is fetched via appQuery and passed through opt.env.edgeConfig
 */
export async function getIPRestrictions(
	appId: number,
	envId: number,
	envData?: EnvironmentData
): Promise< IPRestrictionsResponse > {
	// If edgeConfig data was already loaded via appQuery, use it
	if ( envData?.edgeConfig?.accessRestrictions?.ip ) {
		return {
			data: envData.edgeConfig.accessRestrictions.ip,
			status: 'success',
		};
	}

	// Otherwise, query GraphQL directly
	const query = gql`
		query GetIPRestrictions($appId: Int!, $envId: Int!) {
			app(id: $appId) {
				environments(id: $envId) {
					edgeConfig {
						accessRestrictions {
							ip {
								action
								groups {
									id
									ips
									notes
									createdAt
									updatedAt
								}
							}
						}
					}
				}
			}
		}
	`;

	const api = API();
	const response = await api.query< IPRestrictionsQueryResponse >( {
		query,
		variables: { appId, envId },
	} );

	if ( ! response.data?.app?.environments?.[ 0 ]?.edgeConfig?.accessRestrictions?.ip ) {
		throw new Error( 'Failed to get IP restrictions configuration' );
	}

	return {
		data: response.data.app.environments[ 0 ].edgeConfig.accessRestrictions.ip,
		status: 'success',
	};
}

/**
 * Update IP Restrictions configuration for an environment
 */
export async function updateIPRestrictions(
	appId: number,
	envId: number,
	config: IPRestrictionsConfig
): Promise< IPRestrictionsResponse > {
	const mutation = gql`
		mutation UpdateIPAccessRestrictions($input: EdgeConfigUpdateIpAccessRestrictionsInput!) {
			updateIPAccessRestrictions(input: $input) {
				action
				groups {
					id
					ips
					notes
					createdAt
					updatedAt
				}
			}
		}
	`;

	const api = API();
	const response = await api.mutate< UpdateIPAccessRestrictionsResponse >( {
		mutation,
		variables: {
			input: {
				environmentId: envId,
				action: config.action,
				groups: config.groups.map( group => ( {
					id: group.id,
					ips: group.ips,
					notes: group.notes,
				} ) ),
			},
		},
	} );

	if ( ! response.data?.updateIPAccessRestrictions ) {
		throw new Error( 'Failed to update IP restrictions' );
	}

	// Check for permission errors in response
	const result = response.data.updateIPAccessRestrictions;
	if ( ! result ) {
		throw new Error(
			'Insufficient permissions to manage IP Restrictions. Required role: Org Admin or App Admin'
		);
	}

	return {
		data: result,
		status: 'success',
	};
}

/**
 * Parse IP restrictions from text file format
 * Format:
 *   # Mode: deny
 *   192.168.1.0/24 #Office network
 *   10.0.0.5 #Office network
 *   1.2.3.4 #Malicious IPs
 */
export function parseIPRestrictionsFile( fileContent: string ): IPRestrictionsConfig {
	const lines = fileContent
		.split( '\n' )
		.map( l => l.trim() )
		.filter( l => l );

	let action: 'allow' | 'deny' = 'deny'; // default
	const ipsByNote = new Map< string, string[] >();

	for ( const line of lines ) {
		// Check for mode declaration
		if ( line.startsWith( '# Mode:' ) ) {
			const modeValue = line.split( ':' )[ 1 ].trim().toLowerCase();
			if ( modeValue === 'allow' || modeValue === 'deny' ) {
				action = modeValue;
			}
			continue;
		}

		// Skip comments and empty lines
		if ( line.startsWith( '#' ) || ! line ) {
			continue;
		}

		// Parse IP line: "192.168.1.1 #note"
		const match = line.match( /^([^\s#]+)\s*#(.+)$/ );
		if ( ! match ) {
			continue;
		}

		const [ , ip, note ] = match;
		const trimmedNote = note.trim();

		if ( ! ipsByNote.has( trimmedNote ) ) {
			ipsByNote.set( trimmedNote, [] );
		}
		ipsByNote.get( trimmedNote )?.push( ip );
	}

	// Convert to groups array
	const groups = Array.from( ipsByNote.entries() ).map( ( [ note, ips ] ) => ( {
		notes: note,
		ips,
	} ) );

	return { action, groups };
}

/**
 * Format IP restrictions configuration to text file format
 */
export function formatIPRestrictionsFile(
	config: IPRestrictionsConfig,
	metadata?: { environment?: string; timestamp?: string }
): string {
	const lines: string[] = [];

	// Add mode
	lines.push( `# Mode: ${ config.action }` );

	// Add metadata comments if provided
	if ( metadata?.timestamp ) {
		lines.push( `# Exported: ${ metadata.timestamp }` );
	}
	if ( metadata?.environment ) {
		lines.push( `# Environment: ${ metadata.environment }` );
	}

	lines.push( '' ); // Empty line after header

	// Add groups
	for ( const group of config.groups ) {
		for ( const ip of group.ips ) {
			if ( ip ) {
				lines.push( `${ ip } #${ group.notes }` );
			}
		}
	}

	return lines.join( '\n' );
}
