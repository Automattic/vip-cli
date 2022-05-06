
/**
 * External dependencies
 */
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';

/**
 * Internal dependencies
 */
// Reference for testing with env variables within a test: https://github.com/vuejs/vue-test-utils/issues/193

describe( 'validate CreateProxyAgent', () => {
	beforeEach( () => {
		// Clear all applicable environment variables before running test so each test starts "clean"
		// using beforeEach instead of afterEach in case the client running tests has env variables set before the first test is run
		const envVarsToClear = [ 'VIP_PROXY', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'SOCKS_PROXY', 'VIP_USE_SYSTEM_PROXY' ];
		for ( const envVar of envVarsToClear ) {
			delete process.env[ envVar ];
		}
	} );

	// Tests checking for null results
	it.each( [
		{
			// No proxies set, should do nothing
			envVars: [ { VIP_USE_SYSTEM_PROXY: '' }, { VIP_PROXY: '' }, { HTTPS_PROXY: '' }, { HTTP_PROXY: '' }, { SOCKS_PROXY: '' }, { NO_PROXY: '' } ],
			urlToHit: 'https://wpAPI.org/api',
		},
		{
			// HTTPS Proxy set, but feature flag is not set, do nothing
			envVars: [ { VIP_USE_SYSTEM_PROXY: '' }, { VIP_PROXY: '' }, { HTTPS_PROXY: 'https://myproxy.com' }, { HTTP_PROXY: '' }, { SOCKS_PROXY: '' }, { NO_PROXY: '' } ],
			urlToHit: 'http://wpAPI.org/api',
		},
		{
			// HTTP Proxy set, but feature flag is not set, do nothing
			envVars: [ { VIP_USE_SYSTEM_PROXY: '' }, { VIP_PROXY: '' }, { HTTPS_PROXY: '' }, { HTTP_PROXY: 'http://myproxy.com' }, { SOCKS_PROXY: '' }, { NO_PROXY: '' } ],
			urlToHit: 'http://wpAPI.org/api',
		},
		{
			// SOCKS Proxy (not VIP) set, but feature flag is not set, do nothing
			envVars: [ { VIP_USE_SYSTEM_PROXY: '' }, { VIP_PROXY: '' }, { HTTPS_PROXY: '' }, { HTTP_PROXY: '' }, { SOCKS_PROXY: 'socks5://myproxy.com:4022' }, { NO_PROXY: '' } ],
			urlToHit: 'http://wpAPI.org/api',
		},
		{
			// Proxy is enabled, but NO_PROXY is in effect
			envVars: [ { VIP_USE_SYSTEM_PROXY: '1' }, { VIP_PROXY: '' }, { HTTPS_PROXY: 'https://myproxy.com' }, { HTTP_PROXY: '' }, { SOCKS_PROXY: '' }, { NO_PROXY: '*' } ],
			urlToHit: 'https://wpAPI.org/api',
		},
		{
			// Proxy is enabled, but NO_PROXY is in effect
			envVars: [ { VIP_USE_SYSTEM_PROXY: '1' }, { VIP_PROXY: '' }, { HTTPS_PROXY: '' }, { HTTP_PROXY: 'http://myproxy.com' },
				{ SOCKS_PROXY: '' }, { NO_PROXY: '.wp.org,.lndo.site,foo.bar.org' } ],
			urlToHit: 'https://wpAPI.wp.org/api',
		},
		{
			// Proxy is enabled, but NO_PROXY is in effect
			envVars: [ { VIP_USE_SYSTEM_PROXY: '1' }, { VIP_PROXY: '' }, { HTTPS_PROXY: '' }, { HTTP_PROXY: '' }, { SOCKS_PROXY: 'socks5://myproxy.com:4022' }, { NO_PROXY: 'wpAPI.org' } ],
			urlToHit: 'https://wpAPI.org/api',
		},
		{
			// Only the NO_PROXY is set, nothing should be proxied
			envVars: [ { VIP_USE_SYSTEM_PROXY: '1' }, { VIP_PROXY: '' }, { HTTPS_PROXY: '' }, { HTTP_PROXY: '' }, { SOCKS_PROXY: '' }, { NO_PROXY: 'wpAPI.org,.lndo.site,foo.bar.org' } ],
			urlToHit: 'https://wpAPI.org/api',
		},
	] )( 'should return null with %o', async ( { envVars, urlToHit } ) => {
		setEnvironmentVariabeles( envVars );
		// We have to dynamically import the module so we can set environment variables above
		// All tests must be async to support this dynamic import, otherwise the modified env variables are not picked up
		const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;
		const agent = createProxyAgent( urlToHit );
		expect( agent ).toBeNull();
	} );

	// Test checking for non-null results
	it.each( [
		{
			// Validate VIP_PROXY takes precedence over the feature flag
			envVars: [ { VIP_USE_SYSTEM_PROXY: '' }, { VIP_PROXY: 'socks5://myproxy.com:4022' }, { HTTPS_PROXY: '' }, { HTTP_PROXY: '' }, { SOCKS_PROXY: '' }, { NO_PROXY: '' } ],
			urlToHit: 'https://wpAPI.org/api',
			expectedClass: SocksProxyAgent,
		},
		{
			// Validate VIP_PROXY takes precedence over other set proxies
			envVars: [ { VIP_USE_SYSTEM_PROXY: '1' }, { VIP_PROXY: 'socks5://myproxy.com:4022' }, { HTTPS_PROXY: 'https://myproxy.com' }, { HTTP_PROXY: '' }, { SOCKS_PROXY: '' }, { NO_PROXY: '*' } ],
			urlToHit: 'https://wpAPI.org/api',
			expectedClass: SocksProxyAgent,
		},
		{
			// Validate SOCKS_PROXY is the first system proxy checked for
			envVars: [ { VIP_USE_SYSTEM_PROXY: '1' }, { VIP_PROXY: '' }, { HTTPS_PROXY: 'https://myproxy.com' }, { HTTP_PROXY: 'http://myproxy.com' },
				{ SOCKS_PROXY: 'socks5://myproxy.com:4022' }, { NO_PROXY: '' } ],
			urlToHit: 'https://wpAPI.org/api',
			expectedClass: SocksProxyAgent,
		},
		{
			// Validate HTTPS_PROXY is the second system proxy checked for
			envVars: [ { VIP_USE_SYSTEM_PROXY: '1' }, { VIP_PROXY: '' }, { HTTPS_PROXY: 'https://myproxy.com' }, { HTTP_PROXY: 'http://myproxy.com' }, { SOCKS_PROXY: '' }, { NO_PROXY: '' } ],
			urlToHit: 'https://wpAPI.org/api',
			expectedClass: HttpsProxyAgent,
		},
		{
			// Validate HTTP_PROXY is the third system proxy checked for
			envVars: [ { VIP_USE_SYSTEM_PROXY: '1' }, { VIP_PROXY: '' }, { HTTPS_PROXY: '' }, { HTTP_PROXY: 'http://myproxy.com' }, { SOCKS_PROXY: '' }, { NO_PROXY: '' } ],
			urlToHit: 'https://wpAPI.org/api',
			expectedClass: HttpProxyAgent,
		},
		{
			// Validate request is proxied if active no_proxy does not apply
			envVars: [ { VIP_USE_SYSTEM_PROXY: '1' }, { VIP_PROXY: '' }, { HTTPS_PROXY: 'https://myproxy.com' }, { HTTP_PROXY: '' },
				{ SOCKS_PROXY: '' }, { NO_PROXY: 'wpAPI.org,.lndo.site,foo.bar.org' } ],
			urlToHit: 'https://wpAPI2.org/api',
			expectedClass: HttpsProxyAgent,
		},
	] )( 'should return proxy with %o', async ( { envVars, urlToHit, expectedClass } ) => {
		setEnvironmentVariabeles( envVars );
		const createProxyAgent = ( await import( 'lib/http/proxy-agent' ) ).createProxyAgent;
		const agent = createProxyAgent( urlToHit );
		expect( agent ).not.toBeNull();
		expect( agent ).toBeInstanceOf( expectedClass );
	} );

	// Helper function to set environment variables based on passed in object
	// envVars of the form: [ { VAR: 'VALUE' }, { VAR1: 'VALUE1' }, ... ]
	function setEnvironmentVariabeles( envVars ) {
		for ( const index in envVars ) {
			for ( const key in envVars[ index ] ) {
				process.env[ key ] = envVars[ index ][ key ];
			}
		}
	}
} );
