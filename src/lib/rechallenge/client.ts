import debugLib from 'debug';
import { randomUUID } from 'node:crypto';

import { RechallengeHttpError } from './errors';
import { CLIENT_TYPE } from './types';
import http from '../api/http';

import type {
	ElevatedTokenExchangeResponse,
	RechallengeSession,
	RechallengeSessionStatus,
} from './types';

// Derived from http() rather than imported from a fetch library, so this module
// keeps compiling across the node-fetch -> undici migration (trunk #2837).
type HttpResponse = Awaited< ReturnType< typeof http > >;

const debug = debugLib( '@automattic/vip:rechallenge:client' );

function fillTemplate( template: string, challengeId: string ): string {
	return template.replaceAll( '{challengeId}', encodeURIComponent( challengeId ) );
}

async function parseOrThrow< T >( response: HttpResponse, scope: string ): Promise< T > {
	if ( ! response.ok ) {
		const text = await response.text();
		throw new RechallengeHttpError( response.status, text, scope );
	}
	return ( await response.json() ) as T;
}

export async function createSession( opts: {
	path: string;
	requestedOperation: string;
} ): Promise< RechallengeSession > {
	debug( 'createSession scope=%s', opts.requestedOperation );
	const response = await http( opts.path, {
		method: 'POST',
		headers: {
			// New UUID per call — intent is a fresh session per invocation, not request deduplication.
			'Idempotency-Key': randomUUID(),
		},
		body: {
			clientType: CLIENT_TYPE,
			requestedOperation: opts.requestedOperation,
		},
	} );
	return parseOrThrow< RechallengeSession >( response, opts.requestedOperation );
}

export async function getSessionStatus( opts: {
	template: string;
	challengeId: string;
	scope?: string;
} ): Promise< RechallengeSessionStatus > {
	const path = fillTemplate( opts.template, opts.challengeId );
	const response = await http( path, { method: 'GET' } );
	return parseOrThrow< RechallengeSessionStatus >( response, opts.scope ?? '' );
}

export async function exchange( opts: {
	template: string;
	challengeId: string;
	scope?: string;
} ): Promise< ElevatedTokenExchangeResponse > {
	const path = fillTemplate( opts.template, opts.challengeId );
	const response = await http( path, { method: 'POST' } );
	return parseOrThrow< ElevatedTokenExchangeResponse >( response, opts.scope ?? '' );
}
