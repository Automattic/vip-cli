// @flow

/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API from 'lib/api';

export async function get() {
	const api = await API();
	const res = await api.query( {
		query: gql`
			query isVIP {
				me {
					isVIP
				}
			}
		`,
	} );
	return res;
}
