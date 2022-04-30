
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
	beforeEach( () => {
		// While this seems redundant, this handles the case if a user has proxy variables currently set that may affect the first
		// test. The afterEach handle all other tests
		const envVarsToClear = [ 'VIP_PROXY', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'VIP_PROXY_OTHER_ENABLED' ];
		for ( const envVar of envVarsToClear ) {
			delete process.env[ envVar ];
		}
	} );
	afterEach( () => {
		// Clear all relevant environment variables as they will carryover to each test otherwise
		const envVarsToClear = [ 'VIP_PROXY', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'VIP_PROXY_OTHER_ENABLED' ];
		for ( const envVar of envVarsToClear ) {
			delete process.env[ envVar ];
		}
	} );

	// Tests checking for null results
	it.each( [
		{
			envVars: {
				VIP_PROXY: '',
				HTTPS_PROXY: '',
				HTTP_PROXY: '',
				NO_PROXY: '',
				VIP_PROXY_OTHER_ENABLED: '',
			},
			urlToHit: 'https://wpAPI.org/api',
		},
	] )( 'should return null with env: $envVars', async ( { envVars, urlToHit, expectedClassName } ) => {
		// Run helper function to set environment variables
		setEnvironmentVariabeles( envVars );
		// We have to dynamically import the module so we can set environment variables above
		// All tests must be async to support this dynamic import, otherwise the modified env variables are not picked up
		const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;
		const agent = createProxyAgent( urlToHit );
		expect( agent ).not.toBeNull();
	} );

	// Test checking for non-null results
	it.each( [
		{
			envVars: {
				VIP_PROXY: '',
				HTTPS_PROXY: '',
				HTTP_PROXY: '',
				NO_PROXY: '',
				VIP_PROXY_OTHER_ENABLED: '',
			},
			urlToHit: 'https://wpAPI.org/api',
			expectedClassName: 'HttpProxyAgent',
		},
	] )( 'should return $expectedClassName with url: $urlToHit and env: $envVars', async ( { envVars, urlToHit, expectedClassName, expectNullResults } ) => {
		// Run helper function to set environment variables
		setEnvironmentVariabeles( envVars );
		// We have to dynamically import the module so we can set environment variables above
		// All tests must be async to support this dynamic import, otherwise the modified env variables are not picked up
		const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;
		const agent = createProxyAgent( urlToHit );
		expect( agent ).toBeNull();
		expect( agent ).toBeInstanceOf( expectedClassName );
	} );

	// Helper function to set environment variables based on passed in object
	// envVars of the form:
	// {
	// 	'VIP_PROXY' : '',
	// 	'HTTPS_PROXY' : '',
	// 	'HTTP_PROXY' : '',
	// 	'NO_PROXY' : '',
	// 	'VIP_PROXY_OTHER_ENABLED' : ''
	// }
	function setEnvironmentVariabeles( envVars ) {
		if ( envVars.VIP_PROXY ) {
			process.env.VIP_PROXY = envVars.VIP_PROXY;
		}
		if ( envVars.HTTPS_PROXY ) {
			process.env.HTTPS_PROXY = envVars.HTTPS_PROXY;
		}
		if ( envVars.HTTP_PROXY ) {
			process.env.HTTP_PROXY = envVars.HTTP_PROXY;
		}
		if ( envVars.NO_PROXY ) {
			process.env.NO_PROXY = envVars.NO_PROXY;
		}
		if ( envVars.VIP_PROXY_OTHER_ENABLED ) {
			process.env.VIP_PROXY_OTHER_ENABLED = envVars.VIP_PROXY_OTHER_ENABLED;
		}
	}

	// TODO - Move to a table driven approach (see: https://github.com/Automattic/vip/blob/add/proxy-support/__tests__/lib/http/proxy-agent.js)

	// it( 'should validate feature flag', async () => {
	// 	const url = 'https://wpAPI.org/api';
	// 	// Since the VIP_PROXY_OTHER_ENABLED is not set, all other proxy variables should be ignored  (EXCEPT VIP_PROXY)
	// 	process.env.HTTPS_PROXY = 'https://myproxy.com:4022';
	// 	process.env.NO_PROXY = '.wp,.lndo.site';

	// 	// We have to dynamically import the module so we can set environment variables above
	// 	// All tests must be async to support this dynamic import, otherwise the modified env variables are not picked up
	// 	const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

	// 	const agent = createProxyAgent( url );
	// 	expect( agent ).toBeNull();
	// } );

	// it( 'should validate VIP_PROXY takes precedence over everything', async () => {
	// 	const url = 'https://wpAPI.org/api';
	// 	// Even though VIP_PROXY_OTHER_ENABLED is not set, the VIP_PROXY variable should take precedence to keep backwards compatibility
	// 	process.env.VIP_PROXY = 'socks5://myproxy.com:4022';

	// 	const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

	// 	const agent = createProxyAgent( url );
	// 	expect( agent ).not.toBeNull();
	// 	expect( agent ).toBeInstanceOf( SocksProxyAgent );
	// } );

	// it( 'should validate VIP_PROXY takes precedence over other set proxies', async () => {
	// 	const url = 'https://wpAPI.org/api';
	// 	process.env.VIP_PROXY_OTHER_ENABLED = '1';
	// 	process.env.NO_PROXY = '*';
	// 	process.env.VIP_PROXY = 'socks5://myproxy.com:4022';
	// 	process.env.HTTPS_PROXY = 'https://myproxy.com';

	// 	const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

	// 	const agent = createProxyAgent( url );
	// 	expect( agent ).not.toBeNull();
	// 	expect( agent ).toBeInstanceOf( SocksProxyAgent );
	// } );

	// it( 'should create https proxy', async () => {
	// 	const url = 'https://wpAPI.org/api';
	// 	process.env.VIP_PROXY_OTHER_ENABLED = '1';
	// 	process.env.HTTPS_PROXY = 'https://myproxy.com';

	// 	const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

	// 	const agent = createProxyAgent( url );
	// 	expect( agent ).not.toBeNull();
	// 	expect( agent ).toBeInstanceOf( HttpsProxyAgent );
	// } );

	// it( 'should create http proxy', async () => {
	// 	// Note the URL must also be http for this to work
	// 	const url = 'http://wpAPI.org/api';
	// 	process.env.VIP_PROXY_OTHER_ENABLED = '1';
	// 	process.env.HTTP_PROXY = 'http://myproxy.com';

	// 	const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

	// 	const agent = createProxyAgent( url );
	// 	expect( agent ).not.toBeNull();
	// 	expect( agent ).toBeInstanceOf( HttpProxyAgent );
	// } );

	// it( 'should validate non-matching URL to protocol (https)', async () => {
	// 	// Since the given URL uses https and the only proxy env variable set is HTTP, the request should not be proxied
	// 	const url = 'https://wpAPI.org/api';
	// 	process.env.VIP_PROXY_OTHER_ENABLED = '1';
	// 	process.env.HTTP_PROXY = 'http://myproxy.com';

	// 	const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

	// 	const agent = createProxyAgent( url );
	// 	expect( agent ).toBeNull();
	// } );

	// it( 'should validate non-matching URL to protocol (http)', async () => {
	// 	const url = 'http://wpAPI.org/api';
	// 	process.env.VIP_PROXY_OTHER_ENABLED = '1';
	// 	process.env.HTTPS_PROXY = 'https://myproxy.com';

	// 	const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

	// 	const agent = createProxyAgent( url );
	// 	expect( agent ).toBeNull();
	// } );

	// it( 'should validate invalid URL to proxy (no protocol given)', async () => {
	// 	const url = 'wpAPI.org/api';
	// 	process.env.VIP_PROXY_OTHER_ENABLED = '1';
	// 	process.env.HTTPS_PROXY = 'https://myproxy.com';

	// 	const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

	// 	const agent = createProxyAgent( url );
	// 	expect( agent ).toBeNull();
	// } );

	// it( 'should not proxy based on solo wildcard', async () => {
	// 	const url = 'https://wpAPI.org/api';
	// 	// Even though HTTPS_PROXY is set, the NO_PROXY is applicable to the URL and should not be proxied
	// 	process.env.VIP_PROXY_OTHER_ENABLED = '1';
	// 	process.env.HTTPS_PROXY = 'https://myproxy.com';
	// 	process.env.NO_PROXY = '*';

	// 	const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

	// 	const agent = createProxyAgent( url );
	// 	expect( agent ).toBeNull();
	// } );

	// it( 'should not proxy based on domain wildcard', async () => {
	// 	const url = 'https://wpAPI.wp.org/api';
	// 	process.env.VIP_PROXY_OTHER_ENABLED = '1';
	// 	process.env.HTTP_PROXY = 'https://myproxy.com';
	// 	process.env.NO_PROXY = '*.wp,.lndo.site,foo.bar.org';

	// 	const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

	// 	const agent = createProxyAgent( url );
	// 	expect( agent ).toBeNull();
	// } );

	// it( 'should not proxy based on matching subdomain', async () => {
	// 	const url = 'https://wpAPI.org/api';
	// 	process.env.VIP_PROXY_OTHER_ENABLED = '1';
	// 	process.env.HTTPS_PROXY = 'https://myproxy.com';
	// 	process.env.NO_PROXY = 'wpAPI.org';

	// 	const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

	// 	const agent = createProxyAgent( url );
	// 	expect( agent ).toBeNull();
	// } );

	// it( 'should proxy when no_proxy does not apply', async () => {
	// 	const url = 'https://wpAPI.wp.org/api';
	// 	// The url should be proxied by the HTTPS proxy because the given NO_PROXY does not apply
	// 	process.env.VIP_PROXY_OTHER_ENABLED = '1';
	// 	process.env.HTTPS_PROXY = 'https://myproxy.com';
	// 	process.env.NO_PROXY = 'wpAPI.org,.lndo.site,foo.bar.org';

	// 	const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

	// 	const agent = createProxyAgent( url );
	// 	expect( agent ).not.toBeNull();
	// 	expect( agent ).toBeInstanceOf( HttpsProxyAgent );
	// } );

	// it( 'should not proxy when no_proxy is set by itself', async () => {
	// 	const url = 'wpAPI.wp.org/api';
	// 	// An odd case is if a client has NO_PROXY and VIP_PROXY_OTHER_ENABLED set (should not return a proxyAgent)
	// 	process.env.VIP_PROXY_OTHER_ENABLED = '1';
	// 	process.env.NO_PROXY = 'wpAPI.org,.lndo.site,foo.bar.org';

	// 	const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;

	// 	const agent = createProxyAgent( url );
	// 	expect( agent ).toBeNull();
	// } );
} );
