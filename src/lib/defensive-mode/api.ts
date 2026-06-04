import gql from 'graphql-tag';

import API from '../api';

export const appQuery = `
	id
	name
	typeId
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
				effective {
					enabled
					challengeType
					connectionThresholdAbsolute
					connectionThresholdPercentage
					disableAtEpoch
					keepEnabledUnderThresholdForSeconds
					maxRequestRate
					priorityBypass
				}
				stored {
					enabled
					challengeType
					connectionThresholdAbsolute
					connectionThresholdPercentage
				}
			}
		}
	}
	organization {
		id
		name
	}
`;

const STATUS_MUTATION = gql`
	mutation UpdateDefensiveModeStatus($input: AppEnvironmentDefensiveModeUpdateStatusInput) {
		updateDefensiveModeStatus(input: $input) {
			success
			message
		}
	}
`;

const CONFIG_MUTATION = gql`
	mutation UpdateDefensiveModeConfig($input: AppEnvironmentDefensiveModeConfigInput) {
		updateDefensiveModeConfig(input: $input) {
			success
			message
		}
	}
`;

export interface UpdateStatusInput {
	appId: number;
	envId: number;
	enabled: boolean;
}

export interface UpdateConfigInput {
	appId: number;
	envId: number;
	enabled: boolean;
	challengeType: number;
	connectionThresholdAbsolute?: number;
	connectionThresholdPercentage?: number;
}

export async function updateDefensiveModeStatus(
	input: UpdateStatusInput
): Promise< { success: boolean; message: string } > {
	const api = API();
	const result = await api.mutate( {
		mutation: STATUS_MUTATION,
		variables: {
			input: { id: input.appId, environmentId: input.envId, enabled: input.enabled },
		},
	} );
	if ( ! result.data ) {
		throw new Error(
			'updateDefensiveModeStatus returned no data; the API may have rejected the request.'
		);
	}
	return (
		result.data as {
			updateDefensiveModeStatus: { success: boolean; message: string };
		}
	 ).updateDefensiveModeStatus;
}

export async function updateDefensiveModeConfig(
	input: UpdateConfigInput
): Promise< { success: boolean; message: string } > {
	const api = API();
	const mutationInput: Record< string, unknown > = {
		id: input.appId,
		environmentId: input.envId,
		enabled: input.enabled,
		challengeType: input.challengeType,
	};
	if ( input.connectionThresholdAbsolute !== undefined ) {
		mutationInput.connectionThresholdAbsolute = input.connectionThresholdAbsolute;
	}
	if ( input.connectionThresholdPercentage !== undefined ) {
		mutationInput.connectionThresholdPercentage = input.connectionThresholdPercentage;
	}
	const result = await api.mutate( {
		mutation: CONFIG_MUTATION,
		variables: { input: mutationInput },
	} );
	if ( ! result.data ) {
		throw new Error(
			'updateDefensiveModeConfig returned no data; the API may have rejected the request.'
		);
	}
	return (
		result.data as {
			updateDefensiveModeConfig: { success: boolean; message: string };
		}
	 ).updateDefensiveModeConfig;
}
