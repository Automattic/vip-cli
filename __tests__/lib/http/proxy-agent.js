
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
			// No proxies set, should do nothing
			envVars: [ { VIP_PROXY_OTHER_ENABLED: '' }, { VIP_PROXY: '' }, { HTTPS_PROXY: '' }, { HTTP_PROXY: '' }, { NO_PROXY: '' } ],
			urlToHit: 'https://wpAPI.org/api',
		},
		{
			// HTTPS Proxy set, but feature flag is not set, do nothing
			envVars: [ { VIP_PROXY_OTHER_ENABLED: '' }, { VIP_PROXY: '' }, { HTTPS_PROXY: 'https://myproxy.com' }, { HTTP_PROXY: '' }, { NO_PROXY: '' } ],
			urlToHit: 'http://wpAPI.org/api',
		},
		{
			// Proxy is enabled, but NO_PROXY is in effect
			envVars: [ { VIP_PROXY_OTHER_ENABLED: '1' }, { VIP_PROXY: '' }, { HTTPS_PROXY: 'https://myproxy.com' }, { HTTP_PROXY: '' }, { NO_PROXY: '*' } ],
			urlToHit: 'https://wpAPI.org/api',
		},
		{
			// Proxy is enabled, but NO_PROXY is in effect
			envVars: [ { VIP_PROXY_OTHER_ENABLED: '1' }, { VIP_PROXY: '' }, { HTTPS_PROXY: 'https://myproxy.com' }, { HTTP_PROXY: '' }, { NO_PROXY: '.wp.org,.lndo.site,foo.bar.org' } ],
			urlToHit: 'https://wpAPI.wp.org/api',
		},
		{
			// Proxy is enabled, but NO_PROXY is in effect
			envVars: [ { VIP_PROXY_OTHER_ENABLED: '1' }, { VIP_PROXY: '' }, { HTTPS_PROXY: 'https://myproxy.com' }, { HTTP_PROXY: '' }, { NO_PROXY: 'wpAPI.org' } ],
			urlToHit: 'https://wpAPI.org/api',
		},
		{
			// Only the NO_PROXY is set, nothing should be proxied
			envVars: [ { VIP_PROXY_OTHER_ENABLED: '1' }, { VIP_PROXY: '' }, { HTTPS_PROXY: '' }, { HTTP_PROXY: '' }, { NO_PROXY: 'wpAPI.org,.lndo.site,foo.bar.org' } ],
			urlToHit: 'https://wpAPI.org/api',
		},
	] )( 'should return null with %o', async ( { envVars, urlToHit } ) => {
		// Run helper function to set environment variables
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
			// Validate VIP_PROXY takes precedence over everything
			envVars: [ { VIP_PROXY_OTHER_ENABLED: '' }, { VIP_PROXY: 'socks5://myproxy.com:4022' }, { HTTPS_PROXY: '' }, { HTTP_PROXY: '' }, { NO_PROXY: '' } ],
			urlToHit: 'https://wpAPI.org/api',
			expectedClass: SocksProxyAgent,
		},
		{
			// Validate VIP_PROXY takes precedence over other set proxies
			envVars: [ { VIP_PROXY_OTHER_ENABLED: '1' }, { VIP_PROXY: 'socks5://myproxy.com:4022' }, { HTTPS_PROXY: 'https://myproxy.com' }, { HTTP_PROXY: '' }, { NO_PROXY: '*' } ],
			urlToHit: 'https://wpAPI.org/api',
			expectedClass: SocksProxyAgent,
		},
		{
			// Validate HTTPS_PROXY can be created
			envVars: [ { VIP_PROXY_OTHER_ENABLED: '1' }, { VIP_PROXY: '' }, { HTTPS_PROXY: 'https://myproxy.com' }, { HTTP_PROXY: '' }, { NO_PROXY: '' } ],
			urlToHit: 'https://wpAPI.org/api',
			expectedClass: HttpsProxyAgent,
		},
		{
			// Validate request is proxied if active no_proxy does not apply
			envVars: [ { VIP_PROXY_OTHER_ENABLED: '1' }, { VIP_PROXY: '' }, { HTTPS_PROXY: 'https://myproxy.com' }, { HTTP_PROXY: '' }, { NO_PROXY: 'wpAPI.org,.lndo.site,foo.bar.org' } ],
			urlToHit: 'https://wpAPI2.org/api',
			expectedClass: HttpsProxyAgent,
		},
	] )( 'should return proxy with %o', async ( { envVars, urlToHit, expectedClass } ) => {
		// Run helper function to set environment variables
		setEnvironmentVariabeles( envVars );
		// We have to dynamically import the module so we can set environment variables above
		// All tests must be async to support this dynamic import, otherwise the modified env variables are not picked up
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
