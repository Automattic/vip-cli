
/**
 * External dependencies
 */
import { SocksProxyAgent } from 'socks-proxy-agent';

/**
 * Internal dependencies
 */
// Reference for testing with env variables within a test: https://github.com/vuejs/vue-test-utils/issues/193

describe( 'validate CreateProxyAgent', () => {
	it( 'validates feature flag', async () => {
		const url = 'https://wpAPI.org/api';

		// Import the module dynamically so we can use environment variables (see other tests)
		const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

		const agent = createProxyAgent( url );
		expect( agent ).toBeNull();
	} );

	it( 'validates feature flag takes precedence for other proxies', async () => {
		const url = 'https://wpAPI.org/api';
		// Since the VIP_PROXY_OTHER_ENABLED is not set, all other proxy variables should be ignored  (EXCEPT VIP_PROXY)
		process.env.HTTPS_PROXY = 'https://myproxy.com:4022';
		process.env.NO_PROXY = '.wp,.lndo.site';

		// Import the module dynamically so we can use environment variables (see other tests)
		const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

		const agent = createProxyAgent( url );
		expect( agent ).toBeNull();
	} );

	it( 'validates socks proxy takes precedence over feature flag', async () => {
		const url = 'https://wpAPI.org/api';
		process.env.VIP_PROXY = 'https://myproxy.com:4022';

		// Import the module dynamically so we can use environment variables (see other tests)
		const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

		const agent = createProxyAgent( url );
		expect( agent ).not.toBeNull();
		expect( agent ).toBeInstanceOf( SocksProxyAgent );
	} );
} );
