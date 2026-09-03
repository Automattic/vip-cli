import debugLib from 'debug';
import { jwtDecode } from 'jwt-decode';
import { randomUUID } from 'node:crypto';

import { API_HOST, PRODUCTION_API_HOST } from './api/constants';
import { getKeychain } from './keychain';

const debug = debugLib( '@automattic/vip:token' );

interface Payload {
	id?: number;
	iat?: number;
	exp?: number;
}

// Config
export const SERVICE = 'vip-go-cli';
export default class Token {
	private readonly _raw?: string;
	private readonly _id?: number;
	private readonly iat?: Date;
	private readonly exp?: Date;

	constructor( token: string ) {
		if ( ! token ) {
			return;
		}

		token = token.trim();
		if ( ! token.length ) {
			return;
		}

		const decodedToken = jwtDecode< Payload >( token );
		this._raw = token;

		if ( decodedToken.id ) {
			this._id = decodedToken.id;
		}

		if ( decodedToken.iat ) {
			this.iat = new Date( decodedToken.iat * 1000 );
		}

		if ( decodedToken.exp ) {
			this.exp = new Date( decodedToken.exp * 1000 );
		}
	}

	public valid(): boolean {
		if ( ! this._id ) {
			return false;
		}

		if ( ! this.iat ) {
			return false;
		}

		const now = new Date();
		if ( ! this.exp ) {
			return now > this.iat;
		}

		return now > this.iat && now < this.exp;
	}

	public expired(): boolean {
		if ( ! this.exp ) {
			return false;
		}

		const now = new Date();
		return now > this.exp;
	}

	public get id(): number {
		return this._id ?? NaN;
	}

	public get raw(): string {
		return this._raw ?? '';
	}

	// Per-process fallback used when the keychain cannot be reached (e.g. a
	// locked OS keychain over SSH). Keeps analytics working anonymously for the
	// lifetime of the process instead of crashing a command that would
	// otherwise succeed.
	private static ephemeralUuid?: string;

	public static async uuid(): Promise< string > {
		const service = Token.getServiceName( '-uuid' );

		try {
			const keychain = await getKeychain();
			let _uuid = await keychain.getPassword( service );
			if ( ! _uuid ) {
				_uuid = randomUUID();
				await keychain.setPassword( service, _uuid );
			}

			return _uuid;
		} catch ( err ) {
			debug( 'Failed to read/write analytics UUID from keychain; using an ephemeral UUID', err );
			Token.ephemeralUuid ??= randomUUID();
			return Token.ephemeralUuid;
		}
	}

	public static async setUuid( _uuid: string ): Promise< void > {
		const service = Token.getServiceName( '-uuid' );
		const keychain = await getKeychain();
		await keychain.setPassword( service, _uuid );
	}

	public static async set( token: string ): Promise< boolean > {
		const service = Token.getServiceName();
		const keychain = await getKeychain();
		return keychain.setPassword( service, token );
	}

	public static async get(): Promise< Token > {
		const service = Token.getServiceName();
		const keychain = await getKeychain();
		const token = await keychain.getPassword( service );
		return new Token( token ?? '' );
	}

	public static async purge(): Promise< boolean > {
		const service = Token.getServiceName();
		const keychain = await getKeychain();
		return keychain.deletePassword( service );
	}

	public static getServiceName( modifier: string = '' ): string {
		let service = SERVICE;

		if ( PRODUCTION_API_HOST !== API_HOST ) {
			const sanitized = API_HOST.replace( /[^a-z0-9]/gi, '-' );

			service = `${ SERVICE }:${ sanitized }`;
		}

		return `${ service }${ modifier }`;
	}
}
