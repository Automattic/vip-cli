/**
 * External dependencies
 */
// import ProxyAgent from 'socks-proxy-agent';

import ProxyAgent from 'proxy-agent';

/**
 * Internal dependencies
 */

// Note: This module requires the use of a special environment variable "VIP_PROXY_ENABLED"
// The setting of it to any value allows this module to create a proxy agent based on proxy environment variables
// If not set, this module will revert back to the previous functionality (hence being fully backward compatible and non-breaking for users)

// Allow users to use either lower or uppercase versions of proxy variable names (uppercase will get precedence)
const HTTPS_PROXY = process.env.HTTPS_PROXY | process.env.https_proxy | null
const HTTP_PROXY = process.env.HTTP_PROXY | process.env.http_proxy | null
const NO_PROXY = process.env.NO_PROXY | process.env.no_proxy | null
const VIP_PROXY = process.env.VIP_PROXY | null
const PROXY_FEATURE_ENABLED = process.env.VIP_PROXY_ENABLED | null

export default function createProxyAgent(url) {
	// VIP Socks Proxy should take precedence, should be fully backward compatible
	if ( VIP_PROXY ) {
		return new ProxyAgent( VIP_PROXY );
	}
	else if (PROXY_FEATURE_ENABLED && !CoveredInNoProxy(url) && (HTTPS_PROXY || HTTP_PROXY))
	{
		return GetWebProxyAgentBasedOnProtocol(url);
	}
	// If no environment variables are set, the no proxy is in effect, or if the proxy enable is not set return null (equivilant of no Proxy agent)
	else {
		return null;
	}
}

// Determine if a NO_PROXY variable is applicable to a given URL
// Parameters:
//	- url (string): absolute desintation URL (including the protocol)
// Requires: NO_PROXY cannot be empty
// NO_PROXY Rules:
//	
// References:
//	- Gitlab Article on Standardizing NO_PROXY: https://about.gitlab.com/blog/2021/01/27/we-need-to-talk-no-proxy/
function CoveredInNoProxy(url) {
	// Allow for the use of a single wild card "*" which means nothing should go through the proxy
}

// Returns either an HTTPS or HTTP ProxyAgent based on the protocol of the given URL
// Parameters:
//	- url (string): absolute desintation URL (including the protocol)
// Requires:
//	- a no_proxy variable is not applicable to the url
//	- the url protocol is either https or http
//	- either the environment variable HTTP_PROXY or HTTPS_PROXY is set
function GetWebProxyAgentBasedOnProtocol(url) {
	var protocol = url.substr(0,5)
	if (protocol.equals("https") && HTTPS_PROXY) {
		return new ProxyAgent( HTTPS_PROXY )
	}
	else if (protocol.equals("http:") && HTTP_PROXY) {
		return new ProxyAgent( HTTP_PROXY )
	}
}
