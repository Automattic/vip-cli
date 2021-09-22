// @flow

/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API from 'lib/api';

const query = gql`
	query GetEnvironmentVariables(
		$appId: Int!
		$envId: Int!
	) {
		app(
			id: $appId
		) {
			id
			environments(
				id: $envId
			) {
				id
				environmentVariables {
					total
					nodes {
						name
					}
				}
			}
		}
	}
`;

export default async function listEnvVars( appId: number, envId: number, format: string ) {
	const api = await API();

	const variables = {
		appId,
		envId,
	};

	const { data } = await api.query( { query, variables } );

	// Environment variable values are never exposed by the public API.
	const value = '**********';

	// Vary data by expected format.
	let key: string = 'name';
	if ( 'keyValue' === format ) {
		key = 'key';
	} else if ( 'ids' === format ) {
		key = 'id';
	}

	return data.app.environments[ 0 ].environmentVariables.nodes.map( ( { name } ) => ( { [ key ]: name, value } ) );
}
