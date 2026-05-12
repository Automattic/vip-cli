import { ProxyAgent } from 'undici';

import { createProxyDispatcher } from '../../../src/lib/http/proxy-dispatcher';

describe( 'createProxyDispatcher', () => {
	let savedEnv;

	beforeAll( () => {
		savedEnv = { ...process.env };
	} );

	beforeEach( () => {
		// Clear all applicable environment variables before each test so each
		// test starts "clean" even if the runner has proxies set in the shell.
		const envVarsToClear = [
			'VIP_PROXY',
			'vip_proxy',
			'HTTPS_PROXY',
			'https_proxy',
			'SOCKS_PROXY',
			'socks_proxy',
			'NO_PROXY',
			'no_proxy',
			'VIP_USE_SYSTEM_PROXY',
		];
		for ( const envVar of envVarsToClear ) {
			delete process.env[ envVar ];
		}
	} );

	afterAll( () => {
		process.env = { ...savedEnv };
	} );

	// Tests that expect null (no proxy)
	it.each( [
		{
			label: 'no proxies set',
			env: {
				VIP_USE_SYSTEM_PROXY: '',
				VIP_PROXY: '',
				HTTPS_PROXY: '',
				SOCKS_PROXY: '',
				NO_PROXY: '',
			},
			url: 'https://wpapi.org/api',
		},
		{
			label: 'HTTPS_PROXY set but VIP_USE_SYSTEM_PROXY not set',
			env: {
				VIP_USE_SYSTEM_PROXY: '',
				VIP_PROXY: '',
				HTTPS_PROXY: 'https://myproxy.com',
				SOCKS_PROXY: '',
				NO_PROXY: '',
			},
			url: 'https://wpapi.org/api',
		},
		{
			label: 'SOCKS_PROXY set but VIP_USE_SYSTEM_PROXY not set',
			env: {
				VIP_USE_SYSTEM_PROXY: '',
				VIP_PROXY: '',
				HTTPS_PROXY: '',
				SOCKS_PROXY: 'socks5://myproxy.com:4022',
				NO_PROXY: '',
			},
			url: 'https://wpapi.org/api',
		},
		{
			label: 'VIP_USE_SYSTEM_PROXY set but NO_PROXY covers all hosts',
			env: {
				VIP_USE_SYSTEM_PROXY: '1',
				VIP_PROXY: '',
				HTTPS_PROXY: 'https://myproxy.com',
				SOCKS_PROXY: '',
				NO_PROXY: '*',
			},
			url: 'https://wpapi.org/api',
		},
		{
			label: 'VIP_USE_SYSTEM_PROXY set but NO_PROXY covers the target host',
			env: {
				VIP_USE_SYSTEM_PROXY: '1',
				VIP_PROXY: '',
				HTTPS_PROXY: '',
				SOCKS_PROXY: 'socks5://myproxy.com:4022',
				NO_PROXY: 'wpapi.org',
			},
			url: 'https://wpapi.org/api',
		},
		{
			label: 'only NO_PROXY is set',
			env: {
				VIP_USE_SYSTEM_PROXY: '1',
				VIP_PROXY: '',
				HTTPS_PROXY: '',
				SOCKS_PROXY: '',
				NO_PROXY: 'wpapi.org,.lndo.site,foo.bar.org',
			},
			url: 'https://wpapi.org/api',
		},
	] )( 'should return null when $label', ( { env, url } ) => {
		for ( const [ key, value ] of Object.entries( env ) ) {
			process.env[ key ] = value;
		}
		expect( createProxyDispatcher( url ) ).toBeNull();
	} );

	// Tests that expect a ProxyAgent
	it.each( [
		{
			label: 'VIP_PROXY set (no feature flag required)',
			env: {
				VIP_USE_SYSTEM_PROXY: '',
				VIP_PROXY: 'http://myproxy.com:8080',
				HTTPS_PROXY: '',
				SOCKS_PROXY: '',
				NO_PROXY: '',
			},
			url: 'https://wpapi.org/api',
		},
		{
			label: 'VIP_PROXY takes precedence over other proxies',
			env: {
				VIP_USE_SYSTEM_PROXY: '1',
				VIP_PROXY: 'http://myproxy.com:8080',
				HTTPS_PROXY: 'https://other.com',
				SOCKS_PROXY: '',
				NO_PROXY: '*',
			},
			url: 'https://wpapi.org/api',
		},
		{
			label: 'SOCKS_PROXY checked first when VIP_USE_SYSTEM_PROXY is set',
			env: {
				VIP_USE_SYSTEM_PROXY: '1',
				VIP_PROXY: '',
				HTTPS_PROXY: 'https://myproxy.com',
				SOCKS_PROXY: 'socks5://myproxy.com:4022',
				NO_PROXY: '',
			},
			url: 'https://wpapi.org/api',
		},
		{
			label: 'HTTPS_PROXY used when VIP_USE_SYSTEM_PROXY is set and no SOCKS_PROXY',
			env: {
				VIP_USE_SYSTEM_PROXY: '1',
				VIP_PROXY: '',
				HTTPS_PROXY: 'https://myproxy.com',
				SOCKS_PROXY: '',
				NO_PROXY: '',
			},
			url: 'https://wpapi.org/api',
		},
		{
			label: 'proxied when NO_PROXY does not cover the target host',
			env: {
				VIP_USE_SYSTEM_PROXY: '1',
				VIP_PROXY: '',
				HTTPS_PROXY: 'https://myproxy.com',
				SOCKS_PROXY: '',
				NO_PROXY: 'wpapi.org,.lndo.site',
			},
			url: 'https://wpapi2.org/api',
		},
		{
			label: 'SOCKS proxy still used when NO_PROXY does not match host',
			env: {
				VIP_USE_SYSTEM_PROXY: '1',
				VIP_PROXY: '',
				HTTPS_PROXY: '',
				SOCKS_PROXY: 'socks5://myproxy.com:4022',
				NO_PROXY: 'example.com',
			},
			url: 'https://wpapi.org/api',
		},
		{
			label: 'port-specific NO_PROXY does not block different ports',
			env: {
				VIP_USE_SYSTEM_PROXY: '1',
				VIP_PROXY: '',
				HTTPS_PROXY: 'https://myproxy.com',
				SOCKS_PROXY: '',
				NO_PROXY: 'wpapi.org:8443',
			},
			url: 'https://wpapi.org/api',
		},
	] )( 'should return a ProxyAgent when $label', ( { env, url } ) => {
		for ( const [ key, value ] of Object.entries( env ) ) {
			process.env[ key ] = value;
		}
		const dispatcher = createProxyDispatcher( url );
		expect( dispatcher ).not.toBeNull();
		expect( dispatcher ).toBeInstanceOf( ProxyAgent );
	} );

	it( 'returns the same ProxyAgent instance for the same proxy URL (caching)', () => {
		process.env.VIP_PROXY = 'http://myproxy.com:8080';
		const first = createProxyDispatcher( 'https://wpapi.org/api' );
		const second = createProxyDispatcher( 'https://wpapi2.org/api' );
		expect( first ).toBe( second );
	} );
} );
