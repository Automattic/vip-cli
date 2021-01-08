/**
 * External dependencies
 */
import ProxyAgent from 'socks-proxy-agent';

/**
 * Internal dependencies
 */

export default function createSocksProxyAgent() {
	if ( ! process.env.VIP_PROXY ) {
		return null;
	}

	return new ProxyAgent( process.env.VIP_PROXY );
}

