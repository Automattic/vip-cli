/**
 * External dependencies
 */
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';

/**
 * Internal dependencies
 */

// Note: This module requires the use of a special environment variable "VIP_PROXY_OTHER_ENABLED"
// The setting of it to any value allows this module to create a proxy agent based on proxy environment variables
// If not set, this module will revert back to the previous functionality (hence being fully backward compatible and non-breaking for users)

// TODO - Validate URL or have some default case?

function createProxyAgent( url ) {
	// VIP Socks Proxy should take precedence, should be fully backward compatible
	if ( process.env.VIP_PROXY ) {
		return new SocksProxyAgent( process.env.VIP_PROXY );
	} else if ( process.env.VIP_PROXY_OTHER_ENABLED && ! CoveredInNoProxy( url ) && ( ( process.env.HTTPS_PROXY || process.env.https_proxy ) || ( process.env.HTTP_PROXY || process.env.http_proxy ) ) ) {
		return GetWebProxyAgentBasedOnProtocol( url );
	}
	// If no environment variables are set, the no proxy is in effect, or if the proxy enable is not set return null (equivilant of no Proxy agent)
	return null;
}

// Determine if a NO_PROXY variable is applicable to a given URL
// Parameters:
//	- url (string): absolute desintation URL (including the protocol)
// Returns:
//	- (boolean) true/false depending on result
// Requires: NO_PROXY cannot be empty
// NO_PROXY Rules:
// TODO
// References:
//	- Gitlab Article on Standardizing NO_PROXY: https://about.gitlab.com/blog/2021/01/27/we-need-to-talk-no-proxy/
function CoveredInNoProxy( url ) {
	// Allow for the use of a single wild card "*" which means nothing should go through the proxy
	return false;
}

// Returns either an HTTPS or HTTP ProxyAgent based on the protocol of the given URL
// Parameters:
//	- url (string): absolute desintation URL (including the protocol)
// Requires:
//	- a no_proxy variable is not applicable to the url
//	- the url protocol is either https or http
//	- either the environment variable HTTP_PROXY or HTTPS_PROXY is set
function GetWebProxyAgentBasedOnProtocol( url ) {
	const protocol = url.substr( 0, 5 );
	if ( protocol === 'https' && process.env.HTTPS_PROXY ) {
		return new HttpsProxyAgent( process.env.HTTPS_PROXY );
	} else if ( protocol === 'http:' && process.env.HTTP_PROXY ) {
		return new HttpProxyAgent( process.env.HTTP_PROXY );
	}
}

// Exports
module.exports = { createProxyAgent };
