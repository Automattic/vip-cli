import debugLib from 'debug';
import fetch, {
	type BodyInit,
	type Response,
	type RequestInit,
	type HeadersInit,
} from 'node-fetch';

import { API_HOST } from '../../lib/api';
import env from '../../lib/env';
import { createProxyAgent } from '../../lib/http/proxy-agent';
import Token from '../../lib/token';

const debug = debugLib( '@automattic/vip:http' );

export type FetchOptions = Omit< RequestInit, 'body' > & {
	// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
	body?: BodyInit | Record< string, unknown >;
	headers?: HeadersInit | Record< string, string >;
};

/**
 * Call the Public API with an arbitrary path (e.g. to connect to REST endpoints).
 * This will include the token in an Authorization header so requests are "logged-in."
 *
 * This is simply a wrapper around node-fetch
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

	const proxyAgent = createProxyAgent( url );

	debug( 'running fetch', url );

	return fetch( url, {
		...options,
		agent: proxyAgent ?? undefined,
		headers: {
			Authorization: `Bearer ${ authToken.raw }`,
			'User-Agent': env.userAgent,
			'Content-Type': 'application/json',
			...( options.headers ?? {} ),
		},
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		body: typeof options.body === 'object' ? JSON.stringify( options.body ) : options.body,
	} );
};
