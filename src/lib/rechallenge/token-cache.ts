import debugLib from 'debug';

import { API_HOST, PRODUCTION_API_HOST } from '../api/constants';
import { getKeychain } from '../keychain';

import type { ElevatedToken } from './types';

const debug = debugLib( '@automattic/vip:rechallenge:cache' );
// Storage strategy: a single keychain entry holds a JSON map { [scope]: ElevatedToken }.
// The vip-cli Keychain interface (src/lib/keychain/keychain.ts) is service-only — there
// is no separate account argument — so per-scope entries under the keytar model would
// require a different keying scheme. The single-blob approach also keeps clearAll() cheap.
// This is marked subject-to-change in the spec pending security review.
const BASE_SERVICE = 'vip-go-cli:elevated';

function serviceName(): string {
	if ( API_HOST === PRODUCTION_API_HOST ) {
		return BASE_SERVICE;
	}
	const sanitized = API_HOST.replace( /[^a-z0-9]/gi, '-' );
	return `${ BASE_SERVICE }:${ sanitized }`;
}

type Blob = Record< string, ElevatedToken >;

let inMemory: Blob | null = null;

async function read(): Promise< Blob > {
	if ( inMemory ) {
		return inMemory;
	}

	const keychain = await getKeychain();
	const raw = await keychain.getPassword( serviceName() );
	if ( ! raw ) {
		inMemory = {};
		return inMemory;
	}

	try {
		const parsed = JSON.parse( raw ) as unknown;
		if ( typeof parsed === 'object' && parsed !== null && ! Array.isArray( parsed ) ) {
			inMemory = parsed as Blob;
		} else {
			debug( 'Elevated token blob had unexpected shape; resetting' );
			inMemory = {};
			await keychain.deletePassword( serviceName() );
		}
	} catch ( err ) {
		debug( 'Failed to parse elevated token blob; resetting (%o)', err );
		inMemory = {};
		await keychain.deletePassword( serviceName() );
	}

	return inMemory;
}

async function write( blob: Blob ): Promise< void > {
	inMemory = blob;
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
	// Treat tokens within the next 5 seconds as effectively expired.
	return Date.now() >= exp - 5_000;
}

async function get( scope: string ): Promise< ElevatedToken | null > {
	const blob = await read();
	const token = blob[ scope ];
	if ( ! token ) {
		return null;
	}
	if ( isExpired( token ) ) {
		debug( 'Cached elevated token for %s is expired; evicting', scope );
		const { [ scope ]: _evicted, ...rest } = blob;
		await write( rest );
		return null;
	}
	return token;
}

async function set( scope: string, token: ElevatedToken ): Promise< void > {
	const blob = await read();
	blob[ scope ] = token;
	await write( blob );
}

async function clearScope( scope: string ): Promise< void > {
	const blob = await read();
	if ( scope in blob ) {
		const { [ scope ]: _removed, ...rest } = blob;
		await write( rest );
	}
}

async function clearAll(): Promise< void > {
	inMemory = {};
	const keychain = await getKeychain();
	await keychain.deletePassword( serviceName() );
}

function _resetInMemoryForTests(): void {
	inMemory = null;
}

export default {
	get,
	set,
	clearScope,
	clearAll,
	_resetInMemoryForTests,
};
