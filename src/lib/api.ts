import type { APIOptions } from './api/client';
import type { ApolloClient, ApolloLink } from '@apollo/client/core';

// Keep constants available without loading Apollo or the HTTP client.
export { API_HOST, API_URL, PRODUCTION_API_HOST } from './api/constants';

let globalGraphQLErrorHandlingEnabled = true;

function loadClient(): typeof import('./api/client') {
	// The literal path lets the standalone bundle include this deferred dependency.
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	return require( './api/client' ) as typeof import('./api/client');
}

export function disableGlobalGraphQLErrorHandling(): void {
	globalGraphQLErrorHandlingEnabled = false;
}

export function enableGlobalGraphQLErrorHandling(): void {
	globalGraphQLErrorHandlingEnabled = true;
}

export function shouldRetryRequest(
	attempt: number,
	operation: ApolloLink.Operation,
	error: unknown
): boolean {
	return loadClient().shouldRetryRequest( attempt, operation, error );
}

export default function API( options: APIOptions = {} ): ApolloClient {
	return loadClient().default( options, () => globalGraphQLErrorHandlingEnabled );
}
