import { GraphQLFormattedError } from 'graphql';

interface RateLimitExceededErrorExtension {
	errorHttpCode: 429;
	retryAfter: string;
	errorCode: string;
}

export interface RateLimitExceededError
	extends GraphQLFormattedError< RateLimitExceededErrorExtension > {}
