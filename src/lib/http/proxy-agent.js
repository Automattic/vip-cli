/**
 * External dependencies
 */
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import { getProxyForUrl } from 'proxy-from-env';

/**
 * Internal dependencies
 */

// Note: This module requires the use of a special environment variable "VIP_PROXY_OTHER_ENABLED"
// The setting of it to any value allows this module to create a proxy agent based on proxy environment variables
// If not set, this module will revert back to the previous functionality (hence being fully backward compatible and non-breaking for users)

// This function returns a proxy given a few scenarios:
// TODO
function createProxyAgent( url ) {
	const HTTPS_PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || null;
	const HTTP_PROXY = process.env.HTTP_PROXY || process.env.http_proxy || null;
	const VIP_PROXY = process.env.VIP_PROXY || process.env.vip_proxy || null;
	const NO_PROXY = process.env.NO_PROXY || process.env.no_proxy || null;

	console.log( 'NO PROXY COVERAGE' );
	console.log( CoveredInNoProxy( url ) );

	// VIP Socks Proxy should take precedence, should be fully backward compatible
	if ( VIP_PROXY ) {
		return new SocksProxyAgent( VIP_PROXY );
	} else if ( process.env.VIP_PROXY_OTHER_ENABLED && ! CoveredInNoProxy( url, NO_PROXY ) && ( HTTPS_PROXY || HTTP_PROXY ) ) {
		// If the URL is not https or http, return an empty proxy
		return GetWebProxyAgentBasedOnProtocol( url, HTTPS_PROXY, HTTP_PROXY );
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
// NO_PROXY Rules (based directly on underlying dependency):
// 1. * (alone): proxy nothing
// 2. *.site: do not proxy any subdomain of a domain
// 3. abc.com: do not proxy www.abc.com, abc.com, etc.
// References:
//	- Gitlab Article on Standardizing NO_PROXY: https://about.gitlab.com/blog/2021/01/27/we-need-to-talk-no-proxy/
function CoveredInNoProxy( url, no_proxy_string ) {
	// If the NO_PROXY env variable is not set, then the URL is not covered in the NO_PROXY (utility below does not handle this case)
	if ( ! no_proxy_string ) {
		return false;
	}
	// If getProxyForUrl returns an empty string, then the host should not be proxied
	// This isn't the most straight forward way to determine if a NO_PROXY is applicable, but the only package I could find that is relatively new and maintained
	return getProxyForUrl( url ) === '';
}

// Returns either an HTTPS or HTTP ProxyAgent based on the protocol of the given URL
// Parameters:
//	- url (string): absolute desintation URL (including the protocol)
//	- httpsProxy (string | null): string location of https proxy (or null)
//	- httpProxy (string | null): string location of http proxy (or null)
// Requires:
//	- a no_proxy variable is not applicable to the url
//	- the url protocol is either https or http
//	- either the environment variable HTTP_PROXY or HTTPS_PROXY is set
// Returns:
// TODO
function GetWebProxyAgentBasedOnProtocol( url, httpsProxy, httpProxy ) {
	const protocol = url.substr( 0, 5 );
	if ( protocol !== 'https' && protocol !== 'http:' ) {
		return null;
	}
	if ( protocol === 'https' && httpsProxy ) {
		return new HttpsProxyAgent( httpsProxy );
	} else if ( protocol === 'http:' && httpProxy ) {
		return new HttpProxyAgent( httpProxy );
	}
	// If the url protocol does not match the proxy variables set, do not return a proxy agent
	return null;
}

// Exports
module.exports = { createProxyAgent };
