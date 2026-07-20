import { ApolloClient } from '@apollo/client/core';
import gql from 'graphql-tag';

import API from '../../lib/api';

import type { IsVipQuery, IsVipQueryVariables } from './feature-flags.generated';

// Lazy-initialize the API client so that this module can be imported during the
// rechallenge module chain without triggering a circular-dependency crash.  The
// cycle that existed before this change:
//   api.ts → rechallenge/link.ts → flow.ts → tracker.ts → tracks.ts
//   → cli/apiConfig.ts → api/feature-flags.ts → api.ts
// By deferring construction to the first call we ensure api.ts is fully
// evaluated before API() is invoked.
let api: ApolloClient | null = null;
function getApi(): ApolloClient {
	if ( ! api ) {
		api = API( { silenceAuthErrors: true } );
	}
	return api;
}

const isVipQuery = gql`
	query isVIP {
		me {
			isVIP
		}
	}
`;

export function get(): Promise< ApolloClient.QueryResult< IsVipQuery > > {
	return getApi().query< IsVipQuery, IsVipQueryVariables >( {
		query: isVipQuery,
		fetchPolicy: 'cache-first',
	} );
}
