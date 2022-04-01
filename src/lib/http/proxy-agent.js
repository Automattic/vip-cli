/**
 * External dependencies
 */
// import ProxyAgent from 'socks-proxy-agent';

import ProxyAgent from 'proxy-agent';

/**
 * Internal dependencies
 */

export default function createProxyAgent() {
	// VIP Socks Proxy should take precedence, should be fully backward compatible
	if ( process.env.VIP_PROXY ) {
		return new ProxyAgent( process.env.VIP_PROXY );
	}
	// HTTPS will take precedence over HTTP
	if ( process.env.HTTPS_PROXY ) {
		return new ProxyAgent( process.env.HTTPS_PROXY );
	}
	if ( process.env.HTTP_PROXY ) {
		return new ProxyAgent( process.env.HTTP_PROXY );
	}
	else {
		return null;
	}
	// TODO - Should we take a URL in and just use it to create the correct proxy agent based on our configuration?
	// This could break if NO_PROXY is set for these things....
}

// Determine if a NO_PROXY variable is applicable to a given URL
// Requires: NO_PROXY cannot be empty
// TODO
function CoveredInNoProxy() {

}
