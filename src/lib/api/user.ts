// @format

/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API from '../../lib/api';
import { IsVipQuery, IsVipQueryVariables } from './feature-flags.generated';
import { User } from '../../graphqlTypes';

const QUERY_CURRENT_USER = gql`
	query Me {
		me {
			id
			displayName
			isVIP
			organizationRoles {
				nodes {
					organizationId
					roleId
				}
			}
		}
	}
`;

export async function getCurrentUserInfo(): Promise< User > {
	const api = await API();

	const response = await api.query< IsVipQuery, IsVipQueryVariables >( {
		query: QUERY_CURRENT_USER,
	} );
	const { me } = response.data;
	if ( ! me ) {
		throw new Error( 'The API did not return any information about the user.' );
	}

	return me;
}
