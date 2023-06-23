/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API from '../../lib/api';
import { App, Exact, Scalars } from '../../graphqlTypes';

type AppQueryVariables = Exact< {
	name: Scalars[ 'String' ][ 'input' ];
} >;

interface AppQueryResult {
	apps?: {
		edges?: App[];
	};
}

type AppByIdQueryVariables = Exact< {
	id: Scalars[ 'Int' ][ 'input' ];
} >;

interface AppByIdQueryResult {
	app?: App;
}

export default async function (
	app: string | number,
	fields: string = 'id,name',
	fragments: string = ''
): Promise< Partial< App > > {
	const api = await API();
	if ( isNaN( +app ) ) {
		const res = await api.query< AppQueryResult, AppQueryVariables >( {
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
				name: app as string,
			},
		} );

		if ( ! res.data.apps?.edges?.length ) {
			return {};
		}

		return res.data.apps.edges[ 0 ];
	}

	if ( typeof app === 'string' ) {
		app = parseInt( app, 10 );
	}

	const res = await api.query< AppByIdQueryResult, AppByIdQueryVariables >( {
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

	if ( ! res.data.app ) {
		return {};
	}

	return res.data.app;
}
