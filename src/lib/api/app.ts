import { DocumentNode } from '@apollo/client';
import { QueryOptions } from '@apollo/client/core/watchQueryOptions';
import gql from 'graphql-tag';

import { App, Exact, Scalars } from '../../graphqlTypes';
import API from '../../lib/api';

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

interface AppQueryOptions extends QueryOptions {
	query: DocumentNode;
	variables: {
		id: number;
	};
	context?: {
		headers: {
			Authorization: string;
		};
	};
}

export default async function (
	app: string | number,
	fields: string = 'id,name',
	fragments: string = ''
): Promise< Partial< App > > {
	const api = API();
	if ( isNaN( Number( app ) ) ) {
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

	const appQuery: AppQueryOptions = {
		query: gql`query App( $id: Int ) {
				app( id: $id ){
					${ fields }
				}
			}
			${ fragments || '' }`,
		variables: {
			id: app,
		},
	};

	const customDeployToken = process.env.WPVIP_DEPLOY_TOKEN;
	if ( customDeployToken ) {
		appQuery.context = {
			headers: {
				Authorization: `Bearer ${ customDeployToken }`,
			},
		};
	}

	const res = await api.query< AppByIdQueryResult, AppByIdQueryVariables >( appQuery );

	if ( ! res.data.app ) {
		return {};
	}

	return res.data.app;
}
