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
				// $FlowFixMe: gql template is not supported by flow
				query: gql`query App( $name: String ) {
					apps( first: 1, name: $name ) {
						total,
						nextCursor,
						edges {
							${ fields }
						}
					}
				}`,
				variables: {
					name: app,
				},
			} );

		if ( ! res ||
			! res.data ||
			! res.data.apps ||
			! res.data.apps.edges ||
			! res.data.apps.edges.length ) {
			return {};
		}

		return res.data.apps.edges[ 0 ];
	}

	const res = await api
		.query( {
			// $FlowFixMe: gql template is not supported by flow
			query: gql`query App( $id: Int ) {
				app( id: $id ){
					${ fields }
				}
			}`,
			variables: {
				id: app,
			}
		} );

	if ( ! res || ! res.data || ! res.data.app ) {
		return {};
	}

	return res.data.app;
}
