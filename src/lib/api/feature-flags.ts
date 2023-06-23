/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API from '../../lib/api';
import { ApolloClient, ApolloQueryResult, NormalizedCacheObject } from '@apollo/client';
import type { IsVipQuery, IsVipQueryVariables } from './feature-flags.generated';

let api: ApolloClient< NormalizedCacheObject >;

// If Token.get() fails, we may have an unhandled rejection
void API().then( client => {
	api = client;
} );

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
