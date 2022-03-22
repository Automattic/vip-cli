/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API from 'lib/api';

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

export async function getCurrentUserInfo() {
	const api = await API();

	const response = await api.query( { query: QUERY_CURRENT_USER } );

	const { data: { me } } = response;
	if ( ! me ) {
		throw new Error( 'The API did not return any information about the user.' );
	}

	return me;
}
