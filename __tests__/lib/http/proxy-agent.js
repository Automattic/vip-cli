
/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import createProxyAgent from 'lib/http/proxy-agent';

describe( 'validateCreateProxyAgent', () => {
	it( 'validates feature flag', () => {
		const url = 'https://wpAPI.org/api';
		process.env.VIP_PROXY_OTHER_ENABLED = '1';
		const agent = createProxyAgent( url );
		expect( agent ).toBeNull();
	} );
} );
