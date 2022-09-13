/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API from 'lib/api';

export default async function( app, fields, fragments ) {
	if ( ! fields ) {
		fields = 'id,name';
	}
	if ( ! fragments ) {
		fragments = '';
	}

	const api = await API();
	if ( isNaN( app ) ) {
		const res = await api
			.query( {
				query: gql`query App( $name: String ) {
					apps( first: 1, name: $name ) {
						total,
						nextCursor,
						edges {
							${ fields }
						}
					}
				}
				${ fragments || '' }`,
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

	app = parseInt( app, 10 );

	const res = await api
		.query( {
			query: gql`query App( $id: Int ) {
				app( id: $id ){
					${ fields }
				}
			}
			${ fragments || '' }`,
			variables: {
				id: app,
			},
		} );

	if ( ! res || ! res.data || ! res.data.app ) {
		return {};
	}

	return res.data.app;
}
