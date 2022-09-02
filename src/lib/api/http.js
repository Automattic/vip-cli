import fetch from 'node-fetch';

import Token from 'lib/token';
import env from 'lib/env';
import { createProxyAgent } from 'lib/http/proxy-agent';
import { API_HOST } from 'lib/api';

const debug = require('debug')('@automattic/vip:http');

/**
 * Call the Public API with an arbitrary path (e.g. to connect to REST endpoints).
 * This will include the token in an Authorization header so requests are "logged-in."
 *
 * This is simply a wrapper around node-fetch
 *
 * @param {string} path API path to pass to `fetch` -- will be prefixed by the API_HOST
 * @param {object} options options to pass to `fetch`
 * @returns {Promise} Return value of the `fetch` call
 */
export default async ( path, options = {} ) => {
	let url = path;

	// For convenience, we support just passing in the path to this function...
	// but some things (Apollo) always pass the full url
	if ( ! path.startsWith( API_HOST ) ) {
		url = `${ API_HOST }${ path }`;
	}

	const authToken = await Token.get();

	const headers = {
		'User-Agent': env.userAgent,
		Authorization: authToken ? `Bearer ${ authToken.raw }` : null,
	};

	const proxyAgent = createProxyAgent( url );

	debug( 'running fetch', url );

	return fetch( url, {
		...options,
		...{
			agent: proxyAgent,
			headers: {
				...headers,
				...{
					'Content-Type': 'application/json',
				},
				...options.headers,
			},
		},
		...{
			body: typeof options.body === 'object' ? JSON.stringify( options.body ) : options.body,
		},
	} );
}
