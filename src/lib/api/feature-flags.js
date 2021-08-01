// @flow

/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API from 'lib/api';

let api;
API()
	.then( client => {
		api = client;
	}	);

const isVipQuery = gql`
	query isVIP {
		me {
			isVIP
		}
	}
`;

export async function get() {
	const res = await api.query( {
		query: isVipQuery,
		fetchPolicy: 'cache-first',
	} );
	return res;
}
