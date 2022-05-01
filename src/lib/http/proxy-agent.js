/**
 * External dependencies
 */
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getProxyForUrl } from 'proxy-from-env';
import debug from 'debug';

/**
 * Internal dependencies
 */

// Note: This module requires the use of a special environment variable "VIP_PROXY_OTHER_ENABLED"
// The setting of it to any value allows this module to create a proxy agent based on proxy environment variables
// If not set, this module will revert back to the previous functionality (hence being fully backward compatible and non-breaking for users)

// This function returns a proxy given a few scenarios (in order of precedence):
// 1. VIP_PROXY is set: a SOCKS proxy is returned same as the previous version of this module
// 2. No applicable variables are set: null is returned (thus, no proxy agent is returned)
// 3. VIP_PROXY_OTHER_ENABLED and HTTPS_PROXY are set: an HTTPS_PROXY is returned (assuming the given url uses the https protocol)
// 4. NO_PROXY is set along with VIP_PROXY_OTHER ENABLED and HTTPS_PROXY: An HTTPS_PROXY is returned assuming NO_PROXY is not applicable to the URL
// Note: HTTP_PROXY is not supported at this time as the wp url is always https in production
function createProxyAgent( url ) {
	const HTTPS_PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || null;
	const VIP_PROXY = process.env.VIP_PROXY || process.env.vip_proxy || null;
	const NO_PROXY = process.env.NO_PROXY || process.env.no_proxy || null;

	// VIP Socks Proxy should take precedence, should be fully backward compatible
	if ( VIP_PROXY ) {
		debug( `Enabling VIP_PROXY proxy support using config: ${ VIP_PROXY }` );
		return new SocksProxyAgent( VIP_PROXY );
	} else if ( process.env.VIP_PROXY_OTHER_ENABLED && ! coveredInNoProxy( url, NO_PROXY ) && HTTPS_PROXY ) {
		// Determine if an HTTPS proxy applies to the URL
		const protocol = url.substr( 0, 5 );
		if ( protocol === 'https' ) {
			debug( `Enabling HTTPS proxy support using config: ${ HTTPS_PROXY }` );
			return new HttpsProxyAgent( HTTPS_PROXY );
		}
		return null;
	}
	// If no environment variables are set, the no proxy is in effect, or if the proxy enable is not set return null (equivilant of no Proxy agent)
	return null;
}

// Determine if a NO_PROXY variable is applicable to a given URL
// Parameters:
//	- url (string): absolute desintation URL (including the protocol)
//	- noProxyString (string | null): string representation of the environments current NO_PROXY or no_proxy variable (NO_PROXY takes precedence)
// Returns:
//	- (boolean) true/false depending on result
// NO_PROXY Rules (based directly on underlying dependency):
// 1. * (alone): proxy nothing
// 2. *.site: do not proxy any subdomain of a domain (top level domain must still be given)
//		Example: '.api' does NOT match wp.api.org, but '.api.org' does (see tests)
// 3. abc.com: do not proxy www.abc.com, abc.com, etc.
// See proxy-from-env on npmjs.org for full "ruleset"
function coveredInNoProxy( url, noProxyString ) {
	// If the NO_PROXY env variable is not set, then the URL is not covered in the NO_PROXY (utility below does not handle this case)
	if ( ! noProxyString ) {
		return false;
	}
	// If getProxyForUrl returns an empty string, then the host should not be proxied
	// This isn't the most straight forward way to determine if a NO_PROXY is applicable, but the only package I could find that is relatively new and maintained
	return getProxyForUrl( url ) === '';
}

// Exports
module.exports = { createProxyAgent };
