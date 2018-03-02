// @flow

/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API from 'lib/api';

export default async function( app: string | number, fields: ?any ): Promise<any> {
	if ( ! fields ) {
		fields = 'id,name';
	}

	const api = await API();
	if ( isNaN( parseInt( app ) ) ) {
		const res = await api
			.query( {
				// $FlowFixMe
				query: gql`{apps(limit:1,name:"${ app }"){
					${ fields }
				}}`
			} );

		if ( ! res || ! res.data || ! res.data.apps || ! res.data.apps.length ) {
			return {};
		}

		return res.data.apps[ 0 ];
	}

	const res = await api
		.query( {
			// $FlowFixMe
			query: gql`{app(id:${ app }){
				${ fields }
			}}`
		} );

	if ( ! res || ! res.data || ! res.data.app ) {
		return {};
	}

	return res.data.app;
}
