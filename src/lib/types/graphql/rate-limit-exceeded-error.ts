import type { GraphQLFormattedError } from 'graphql';

interface RateLimitExceededErrorExtension {
	errorHttpCode: 429;
	retryAfter: string;
	errorCode: string;
	[ key: string ]: unknown;
}

export interface RateLimitExceededError extends GraphQLFormattedError {
	extensions?: RateLimitExceededErrorExtension;
}
