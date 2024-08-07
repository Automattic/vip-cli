import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

import { createProxyAgent } from '../../../src/lib/http/proxy-agent';

// Reference for testing with env variables within a test: https://github.com/vuejs/vue-test-utils/issues/193

describe( 'validate CreateProxyAgent', () => {
	let env;

	beforeAll( () => {
		env = { ...process.env };
	} );

	beforeEach( () => {
		// Clear all applicable environment variables before running test so each test starts "clean"
		// using beforeEach instead of afterEach in case the client running tests has env variables set before the first test is run
		const envVarsToClear = [
			'VIP_PROXY',
			'HTTPS_PROXY',
			'NO_PROXY',
			'SOCKS_PROXY',
			'VIP_USE_SYSTEM_PROXY',
		];
		for ( const envVar of envVarsToClear ) {
			delete process.env[ envVar ];
		}
	} );

	afterAll( () => {
		process.env = { ...env };
	} );

	// Tests checking for null results
	it.each( [
		{
			// No proxies set, should do nothing
			envVars: [
				{ VIP_USE_SYSTEM_PROXY: '' },
				{ VIP_PROXY: '' },
				{ HTTPS_PROXY: '' },
				{ SOCKS_PROXY: '' },
				{ NO_PROXY: '' },
			],
			urlToHit: 'https://wpAPI.org/api',
		},
		{
			// HTTPS Proxy set, but feature flag is not set, do nothing
			envVars: [
				{ VIP_USE_SYSTEM_PROXY: '' },
				{ VIP_PROXY: '' },
				{ HTTPS_PROXY: 'https://myproxy.com' },
				{ SOCKS_PROXY: '' },
				{ NO_PROXY: '' },
			],
			urlToHit: 'http://wpAPI.org/api',
		},
		{
			// SOCKS Proxy (not VIP) set, but feature flag is not set, do nothing
			envVars: [
				{ VIP_USE_SYSTEM_PROXY: '' },
				{ VIP_PROXY: '' },
				{ HTTPS_PROXY: '' },
				{ HTTP_PROXY: '' },
				{ SOCKS_PROXY: 'socks5://myproxy.com:4022' },
				{ NO_PROXY: '' },
			],
			urlToHit: 'http://wpAPI.org/api',
		},
		{
			// Proxy is enabled, but NO_PROXY is in effect
			envVars: [
				{ VIP_USE_SYSTEM_PROXY: '1' },
				{ VIP_PROXY: '' },
				{ HTTPS_PROXY: 'https://myproxy.com' },
				{ HTTP_PROXY: '' },
				{ SOCKS_PROXY: '' },
				{ NO_PROXY: '*' },
			],
			urlToHit: 'https://wpAPI.org/api',
		},
		{
			// Proxy is enabled, but NO_PROXY is in effect
			envVars: [
				{ VIP_USE_SYSTEM_PROXY: '1' },
				{ VIP_PROXY: '' },
				{ HTTPS_PROXY: '' },
				{ SOCKS_PROXY: 'socks5://myproxy.com:4022' },
				{ NO_PROXY: 'wpAPI.org' },
			],
			urlToHit: 'https://wpAPI.org/api',
		},
		{
			// Only the NO_PROXY is set, nothing should be proxied
			envVars: [
				{ VIP_USE_SYSTEM_PROXY: '1' },
				{ VIP_PROXY: '' },
				{ HTTPS_PROXY: '' },
				{ SOCKS_PROXY: '' },
				{ NO_PROXY: 'wpAPI.org,.vipdev.site,foo.bar.org' },
			],
			urlToHit: 'https://wpAPI.org/api',
		},
	] )( 'should return null with %o', async ( { envVars, urlToHit } ) => {
		setEnvironmentVariables( envVars );
		const agent = createProxyAgent( urlToHit );
		expect( agent ).toBeNull();
	} );

	// Test checking for non-null results
	it.each( [
		{
			// Validate VIP_PROXY takes precedence over the feature flag
			envVars: [
				{ VIP_USE_SYSTEM_PROXY: '' },
				{ VIP_PROXY: 'socks5://myproxy.com:4022' },
				{ HTTPS_PROXY: '' },
				{ HTTP_PROXY: '' },
				{ SOCKS_PROXY: '' },
				{ NO_PROXY: '' },
			],
			urlToHit: 'https://wpAPI.org/api',
			expectedClass: SocksProxyAgent,
		},
		{
			// Validate VIP_PROXY takes precedence over other set proxies
			envVars: [
				{ VIP_USE_SYSTEM_PROXY: '1' },
				{ VIP_PROXY: 'socks5://myproxy.com:4022' },
				{ HTTPS_PROXY: 'https://myproxy.com' },
				{ HTTP_PROXY: '' },
				{ SOCKS_PROXY: '' },
				{ NO_PROXY: '*' },
			],
			urlToHit: 'https://wpAPI.org/api',
			expectedClass: SocksProxyAgent,
		},
		{
			// Validate SOCKS_PROXY is the first system proxy checked for
			envVars: [
				{ VIP_USE_SYSTEM_PROXY: '1' },
				{ VIP_PROXY: '' },
				{ HTTPS_PROXY: 'https://myproxy.com' },
				{ HTTP_PROXY: 'http://myproxy.com' },
				{ SOCKS_PROXY: 'socks5://myproxy.com:4022' },
				{ NO_PROXY: '' },
			],
			urlToHit: 'https://wpAPI.org/api',
			expectedClass: SocksProxyAgent,
		},
		{
			// Validate HTTPS_PROXY is the second system proxy checked for
			envVars: [
				{ VIP_USE_SYSTEM_PROXY: '1' },
				{ VIP_PROXY: '' },
				{ HTTPS_PROXY: 'https://myproxy.com' },
				{ HTTP_PROXY: 'http://myproxy.com' },
				{ SOCKS_PROXY: '' },
				{ NO_PROXY: '' },
			],
			urlToHit: 'https://wpAPI.org/api',
			expectedClass: HttpsProxyAgent,
		},
		{
			// Validate request is proxied if active no_proxy does not apply
			envVars: [
				{ VIP_USE_SYSTEM_PROXY: '1' },
				{ VIP_PROXY: '' },
				{ HTTPS_PROXY: 'https://myproxy.com' },
				{ HTTP_PROXY: '' },
				{ SOCKS_PROXY: '' },
				{ NO_PROXY: 'wpAPI.org,.vipdev.site,foo.bar.org' },
			],
			urlToHit: 'https://wpAPI2.org/api',
			expectedClass: HttpsProxyAgent,
		},
	] )( 'should return proxy with %o', async ( { envVars, urlToHit, expectedClass } ) => {
		setEnvironmentVariables( envVars );
		const agent = createProxyAgent( urlToHit );
		expect( agent ).not.toBeNull();
		expect( agent ).toBeInstanceOf( expectedClass );
	} );

	// Helper function to set environment variables based on passed in object
	// envVars of the form: [ { VAR: 'VALUE' }, { VAR1: 'VALUE1' }, ... ]
	function setEnvironmentVariables( envVars ) {
		for ( const index in envVars ) {
			for ( const key in envVars[ index ] ) {
				process.env[ key ] = envVars[ index ][ key ];
			}
		}
	}
} );
