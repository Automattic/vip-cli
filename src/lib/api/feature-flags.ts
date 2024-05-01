import { ApolloClient, ApolloQueryResult, NormalizedCacheObject } from '@apollo/client';
import gql from 'graphql-tag';

import API from '../../lib/api';

import type { IsVipQuery, IsVipQueryVariables } from './feature-flags.generated';

const api: ApolloClient< NormalizedCacheObject > = API();

const isVipQuery = gql`
	query isVIP {
		me {
			isVIP
		}
	}
`;

export async function get(): Promise< ApolloQueryResult< IsVipQuery > | undefined > {
	return await api.query< IsVipQuery, IsVipQueryVariables >( {
		query: isVipQuery,
		fetchPolicy: 'cache-first',
	} );
}
