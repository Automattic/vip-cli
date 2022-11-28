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
    query GetNetworkSite(
        $appId: Int!
        $envId: Int!
        $blogId: Int!
        $isProduction: Boolean!
    ) {
        app(
            id: $appId
        ) {
            id
            environments(
                id: $envId
            ) {
                id
                wpSitesSDS(blogId: $blogId) {
                    nodes {
                        id
                        blogId
                        siteUrl
                        homeUrl
                        timestamp
                        launchStatus @include(if: $isProduction)
                    }
                }
            }
        }
    }
`;

// List the names (but not values) of environment variables.
export default async function getNetworkSite( appId: number, envId: number, blogId: number, envType: string ) {
	const api = await API();

	const variables = {
		appId,
		envId,
		blogId,
		isProduction: envType === 'production',
	};

	const { data } = await api.query( { query, variables } );
	// todo error message if not found
	return data.app.environments[ 0 ].wpSitesSDS.nodes[ 0 ];
}
