/**
 * External dependencies
 */
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getProxyForUrl } from 'proxy-from-env';
import debugLib from 'debug';
const debug = debugLib( 'vip:proxy-agent' );

/**
 * Internal dependencies
 */

// Note: This module requires the use of a special environment variable "VIP_USE_SYSTEM_PROXY"
// The setting of it to any value allows this module to create a proxy agent based on proxy environment variables
// If not set, this module will revert back to the previous functionality (hence being fully backward compatible and non-breaking for users)

// This function returns a proxy given a few scenarios (in order of precedence):
// 1. VIP_PROXY is set: a SOCKS proxy is returned same as the previous version of this module
// 2. No applicable variables are set: null is returned (thus, no proxy agent is returned)
// 3. VIP_USE_SYSTEM_PROXY and SOCKS_PROXY are set: a SOCKS_PROXY is returned
// 4. VIP_USE_SYSTEM_PROXY and HTTPS_PROXY are set: an HTTPS_PROXY is returned
// 5. NO_PROXY is set along with VIP_USE_SYSTEM_PROXY and any system proxy: null is returned if the no proxy applies, otherwise the first active proxy is used
// This allows near full customization by the client of what proxy should be used, instead of making assumptions based on the URL string
function createProxyAgent( url ) {
	const VIP_PROXY = process.env.VIP_PROXY || process.env.vip_proxy || null;
	const SOCKS_PROXY = process.env.SOCKS_PROXY || process.env.socks_proxy || null;
	const HTTPS_PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || null;
	const NO_PROXY = process.env.NO_PROXY || process.env.no_proxy || null;

	// VIP Socks Proxy should take precedence and should be fully backward compatible
	if ( VIP_PROXY ) {
		debug( `Enabling VIP_PROXY proxy support using config: ${ VIP_PROXY }` );
		return new SocksProxyAgent( VIP_PROXY );
	}
	// Now check for any system proxy usage
	if ( process.env.VIP_USE_SYSTEM_PROXY && ! coveredInNoProxy( url, NO_PROXY ) ) {
		if ( SOCKS_PROXY ) {
			debug( `Enabling SOCKS proxy support using config: ${ SOCKS_PROXY }` );
			return new SocksProxyAgent( SOCKS_PROXY );
		}
		if ( HTTPS_PROXY ) {
			debug( `Enabling HTTPS proxy support using config: ${ HTTPS_PROXY }` );
			return new HttpsProxyAgent( HTTPS_PROXY );
		}
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
