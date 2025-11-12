import { ApolloClient } from '@apollo/client';
import gql from 'graphql-tag';

import API from '../../lib/api';

import type { IsVipQuery, IsVipQueryVariables } from './feature-flags.generated';

const api: ApolloClient = API( { silenceAuthErrors: true } );

const isVipQuery = gql`
	query isVIP {
		me {
			isVIP
		}
	}
`;

export function get(): Promise< ApolloClient.QueryResult< IsVipQuery > > {
	return api.query< IsVipQuery, IsVipQueryVariables >( {
		query: isVipQuery,
		fetchPolicy: 'cache-first',
	} );
}
