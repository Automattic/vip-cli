
/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { createProxyAgent } from 'lib/http/proxy-agent';

describe( 'validateCreateProxyAgent', () => {
	it( 'validates feature flag', () => {
		process.env.VIP_PROXY_OTHER_ENABLED = '1';
		const agent = createProxyAgent();
		expect( agent ).toBeNull();
	} );
} );
