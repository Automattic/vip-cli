// @flow

/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API from 'lib/api';

export default async function(): Promise<any> {
	const api = await API();

	const res = await api
		.query( {
			// $FlowFixMe: gql template is not supported by flow
			query: gql`query Me {
				me {
					id
					isVIP
				}
			}`,
		} );

	if ( ! res || ! res.data ) {
		return {};
	}

	return res.data;
}
