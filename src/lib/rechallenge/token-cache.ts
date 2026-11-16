import debugLib from 'debug';
import { createHash } from 'node:crypto';

import { API_HOST, PRODUCTION_API_HOST } from '../api/constants';
import { getKeychain } from '../keychain';
import Token from '../token';

import type { ElevatedToken } from './types';
import type { TokenSource } from '../token';

const debug = debugLib( '@automattic/vip:rechallenge:cache' );
const BASE_SERVICE = 'vip-go-cli:elevated';

type CachedToken = ElevatedToken & { primaryTokenFingerprint: string };
type Blob = Record< string, CachedToken >;

let storedInMemory: Blob | null = null;
let environmentInMemory: Blob = {};

function serviceName(): string {
	if ( API_HOST === PRODUCTION_API_HOST ) {
		return BASE_SERVICE;
	}
	const sanitized = API_HOST.replace( /[^a-z0-9]/gi, '-' );
	return `${ BASE_SERVICE }:${ sanitized }`;
}

function fingerprint( raw: string ): string {
	return createHash( 'sha256' ).update( raw ).digest( 'hex' );
}

async function read( source: TokenSource ): Promise< Blob > {
	if ( source === 'environment' ) {
		return environmentInMemory;
	}
	if ( storedInMemory ) {
		return storedInMemory;
	}

	const keychain = await getKeychain();
	const raw = await keychain.getPassword( serviceName() );
	if ( ! raw ) {
		storedInMemory = {};
		return storedInMemory;
	}

	try {
		const parsed = JSON.parse( raw ) as unknown;
		if ( typeof parsed === 'object' && parsed !== null && ! Array.isArray( parsed ) ) {
			storedInMemory = parsed as Blob;
		} else {
			debug( 'Elevated token blob had unexpected shape; resetting' );
			storedInMemory = {};
			await keychain.deletePassword( serviceName() );
		}
	} catch {
		debug( 'Failed to parse elevated token blob; resetting' );
		storedInMemory = {};
		await keychain.deletePassword( serviceName() );
	}

	return storedInMemory;
}

async function write( blob: Blob, source: TokenSource ): Promise< void > {
	if ( source === 'environment' ) {
		environmentInMemory = blob;
		return;
	}
	storedInMemory = blob;
	const keychain = await getKeychain();
	if ( Object.keys( blob ).length === 0 ) {
		await keychain.deletePassword( serviceName() );
	} else {
		await keychain.setPassword( serviceName(), JSON.stringify( blob ) );
	}
}

function isExpired( token: ElevatedToken ): boolean {
	const exp = Date.parse( token.expiresAt );
	if ( Number.isNaN( exp ) ) {
		return true;
	}
	return Date.now() >= exp - 5_000;
}

async function get( scope: string ): Promise< ElevatedToken | null > {
	const { token: primary, source } = await Token.resolve();
	const blob = await read( source );
	const cached = blob[ scope ];
	if ( ! cached ) {
		return null;
	}
	if ( cached.primaryTokenFingerprint !== fingerprint( primary.raw ) || isExpired( cached ) ) {
		debug( 'Cached elevated token for %s is expired or belongs to another primary token', scope );
		const { [ scope ]: _evicted, ...rest } = blob;
		await write( rest, source );
		return null;
	}
	const { primaryTokenFingerprint: _fingerprint, ...elevated } = cached;
	return elevated;
}

async function set( scope: string, token: ElevatedToken ): Promise< void > {
	const { token: primary, source } = await Token.resolve();
	const blob = await read( source );
	blob[ scope ] = { ...token, primaryTokenFingerprint: fingerprint( primary.raw ) };
	await write( blob, source );
}

async function clearScope( scope: string ): Promise< void > {
	const { source } = await Token.resolve();
	const blob = await read( source );
	if ( scope in blob ) {
		const { [ scope ]: _removed, ...rest } = blob;
		await write( rest, source );
	}
}

async function clearAll(): Promise< void > {
	if ( Token.isEnvironmentSet() ) {
		environmentInMemory = {};
		return;
	}
	storedInMemory = {};
	const keychain = await getKeychain();
	await keychain.deletePassword( serviceName() );
}

function _resetInMemoryForTests(): void {
	storedInMemory = null;
	environmentInMemory = {};
}

export default { get, set, clearScope, clearAll, _resetInMemoryForTests };
