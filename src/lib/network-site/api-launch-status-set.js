// @flow

/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API from 'lib/api';
import { NetworkSiteInfo, NetworkSiteLaunchStatusSetResponse } from './types';

const SET_LAUNCH_STATUS_MUTATION = gql`
    mutation UpdateWPSiteLaunchStatusMutation(
        $input: WPSiteLaunchStatusInput
    ) {
        updateWPSiteLaunchStatus( input: $input ){
            networkSiteId
            updated
            launchStatus
        }
    }
`;

// List the names (but not values) of environment variables.
export default async function setNetworkSiteLaunchStatus( appId: number, envId: number, blogId: number, launchStatus: NetworkSiteInfo['launchStatus'] ): NetworkSiteLaunchStatusSetResponse {
	const api = await API();

	const variables = {
		input: {
			appId,
			environmentId: envId,
			networkSiteId: blogId,
			launchStatus: launchStatus,
		},
	};

	const { data } = await api.mutate( { SET_LAUNCH_STATUS_MUTATION, variables } );
	// todo manage error messages

	return data?.updateWPSiteLaunchStatus;
}
