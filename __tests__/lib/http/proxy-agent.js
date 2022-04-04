
/**
 * External dependencies
 */
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

/**
 * Internal dependencies
 */
// Reference for testing with env variables within a test: https://github.com/vuejs/vue-test-utils/issues/193

describe( 'validate CreateProxyAgent', () => {
	afterEach( () => {
		// Clear all relevant environment variables as they carryover to each test
		delete process.env.VIP_PROXY;
		delete process.env.HTTPS_PROXY;
		delete process.env.HTTP_PROXY;
		delete process.env.NO_PROXY;
		delete process.env.VIP_PROXY_OTHER_ENABLED;
	} );

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

		const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

		const agent = createProxyAgent( url );
		expect( agent ).toBeNull();
	} );

	it( 'validates socks proxy takes precedence over feature flag', async () => {
		const url = 'https://wpAPI.org/api';

		process.env.VIP_PROXY = 'socks5://myproxy.com:4022';

		const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

		const agent = createProxyAgent( url );
		expect( agent ).not.toBeNull();
		expect( agent ).toBeInstanceOf( SocksProxyAgent );
	} );

	it( 'validates socks proxy takes precedence over other proxies', async () => {
		const url = 'https://wpAPI.org/api';

		process.env.VIP_PROXY_OTHER_ENABLED = '1';
		process.env.VIP_PROXY = 'socks5://myproxy.com:4022';
		process.env.HTTPS_PROXY = 'https://myproxy.com';

		const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

		const agent = createProxyAgent( url );
		expect( agent ).not.toBeNull();
		expect( agent ).toBeInstanceOf( SocksProxyAgent );
	} );

	it( 'validates https proxy', async () => {
		const url = 'https://wpAPI.org/api';

		process.env.VIP_PROXY_OTHER_ENABLED = '1';
		process.env.HTTPS_PROXY = 'https://myproxy.com';

		const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

		const agent = createProxyAgent( url );
		expect( agent ).not.toBeNull();
		expect( agent ).toBeInstanceOf( HttpsProxyAgent );
	} );

	it( 'validates http proxy', async () => {
		// Note the URL must also be http for this to work
		const url = 'http://wpAPI.org/api';

		process.env.VIP_PROXY_OTHER_ENABLED = '1';
		process.env.HTTP_PROXY = 'http://myproxy.com';

		const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

		const agent = createProxyAgent( url );
		expect( agent ).not.toBeNull();
		expect( agent ).toBeInstanceOf( HttpProxyAgent );
	} );

	// Confirm that if a user attempts to proxy an https url while only having HTTP_PROXY set, the request is not proxied
	// Check the reverse case as well
	it( 'validates non-matching URL to protocol (https)', async () => {
		const url = 'https://wpAPI.org/api';

		process.env.VIP_PROXY_OTHER_ENABLED = '1';
		process.env.HTTP_PROXY = 'http://myproxy.com';

		const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

		const agent = createProxyAgent( url );
		expect( agent ).toBeNull();
	} );

	it( 'validates non-matching URL to protocol (http)', async () => {
		const url = 'http://wpAPI.org/api';

		process.env.VIP_PROXY_OTHER_ENABLED = '1';
		process.env.HTTPS_PROXY = 'https://myproxy.com';

		const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

		const agent = createProxyAgent( url );
		expect( agent ).toBeNull();
	} );

	// TODO - No Proxy tests
} );
