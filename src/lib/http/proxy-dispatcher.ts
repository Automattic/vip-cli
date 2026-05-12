import debugLib from 'debug';
import { getProxyForUrl } from 'proxy-from-env';
import { ProxyAgent, type Dispatcher } from 'undici';

const debug = debugLib( 'vip:proxy-dispatcher' );

const proxyDispatchers = new Map< string, Dispatcher >();

function isCoveredByNoProxy( url: string ): boolean {
	const NO_PROXY = process.env.NO_PROXY || process.env.no_proxy || null; // NOSONAR

	if ( ! NO_PROXY ) {
		return false;
	}

	return getProxyForUrl( url ) === '';
}

function resolveProxyUrl( url: string ): string | null {
	const VIP_PROXY = process.env.VIP_PROXY || process.env.vip_proxy || null; // NOSONAR
	const SOCKS_PROXY = process.env.SOCKS_PROXY || process.env.socks_proxy || null; // NOSONAR
	const HTTPS_PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || null; // NOSONAR

	if ( VIP_PROXY ) {
		return VIP_PROXY;
	}

	if ( process.env.VIP_USE_SYSTEM_PROXY && ! isCoveredByNoProxy( url ) ) {
		if ( SOCKS_PROXY ) {
			return SOCKS_PROXY;
		}

		if ( HTTPS_PROXY ) {
			return HTTPS_PROXY;
		}
	}

	return null;
}

let listeners: ReturnType< typeof process.rawListeners< 'warning' > > | null = null;

// Suppress ExperimentalWarning: SOCKS5 proxy support is experimental and subject to change
function suppressExperimentalSocksWarning( warning: Error ): void {
	listeners?.forEach( listener => process.on( 'warning', listener as NodeJS.WarningListener ) );

	if ( warning.name !== 'ExperimentalWarning' || ! /Socks5ProxyAgent/u.test( warning.message ) ) {
		process.emitWarning( warning );
	}
}

/**
 * Build an undici dispatcher from the existing proxy resolution logic.
 *
 * This keeps env precedence in one place while allowing fetch callers to
 * provide `dispatcher` instead of `agent`.
 */
export function createProxyDispatcher( url: string ): Dispatcher | null {
	const proxyUrl = resolveProxyUrl( url );

	if ( ! proxyUrl ) {
		return null;
	}

	if ( ! proxyDispatchers.has( proxyUrl ) ) {
		debug( `Enabling fetch dispatcher proxy support using config: ${ proxyUrl }` );
		proxyDispatchers.set( proxyUrl, new ProxyAgent( proxyUrl ) );
	}

	if ( listeners === null ) {
		listeners = process.rawListeners( 'warning' );
		process.removeAllListeners( 'warning' );
		process.once( 'warning', suppressExperimentalSocksWarning );
	}

	return proxyDispatchers.get( proxyUrl ) ?? null;
}
