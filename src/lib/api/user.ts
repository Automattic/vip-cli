import gql from 'graphql-tag';

import { IsVipQuery, IsVipQueryVariables } from './feature-flags.generated';
import API from '../../lib/api';

import type { Me } from '../../graphqlTypes';

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

export async function getCurrentUserInfo(): Promise< Me > {
	const api = API();

	const response = await api.query< IsVipQuery, IsVipQueryVariables >( {
		query: QUERY_CURRENT_USER,
	} );
	const { me } = response.data;
	if ( ! me ) {
		throw new Error( 'The API did not return any information about the user.' );
	}

	return me;
}
