import debugLib from 'debug';
import { fetch, Headers, type BodyInit, type HeadersInit, type RequestInit } from 'undici';

import { API_HOST } from '../../lib/api';
import env from '../../lib/env';
import { createProxyDispatcher } from '../../lib/http/proxy-dispatcher';
import Token from '../../lib/token';

const debug = debugLib( '@automattic/vip:http' );

export type FetchOptions = Omit< RequestInit, 'body' > & {
	body?: BodyInit | Record< string, unknown >;
	headers?: HeadersInit;
};

/**
 * Call the Public API with an arbitrary path (e.g. to connect to REST endpoints).
 * This will include the token in an Authorization header so requests are "logged-in."
 *
 * @param {string} path    API path to pass to `fetch` -- will be prefixed by the API_HOST
 * @param {Object} options options to pass to `fetch`
 * @return {Promise} Return value of the `fetch` call
 */
export default async ( path: string, options: FetchOptions = {} ): Promise< Response > => {
	let url = path;

	// For convenience, we support just passing in the path to this function...
	// but some things (Apollo) always pass the full url
	if ( ! path.startsWith( API_HOST ) ) {
		url = `${ API_HOST }${ path }`;
	}

	const authToken = await Token.get();
	const proxyDispatcher = createProxyDispatcher( url );

	debug( 'running fetch', url );

	const headers = new Headers( { ...options.headers } );
	if ( ! headers.has( 'Authorization' ) ) {
		headers.set( 'Authorization', `Bearer ${ authToken.raw }` );
	}

	if ( ! headers.has( 'User-Agent' ) ) {
		headers.set( 'User-Agent', env.userAgent );
	}

	if ( ! headers.has( 'Content-Type' ) && options.method !== 'GET' ) {
		headers.set( 'Content-Type', 'application/json' );
	}

	return fetch( url, {
		...options,
		dispatcher: proxyDispatcher ?? undefined,
		headers,
		body: typeof options.body === 'object' ? JSON.stringify( options.body ) : options.body,
	} );
};
