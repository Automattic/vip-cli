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

// Environment variable that supplies the auth token directly, bypassing the
// OS keychain. Precedent: gh's GH_TOKEN and this repo's WPVIP_DEPLOY_TOKEN.
export const ENV_TOKEN_NAME = 'VIP_CLI_TOKEN';

export const TOKEN_URL = 'https://dashboard.wpvip.com/me/cli/token';

/**
 * Thrown when the token supplied via the VIP_CLI_TOKEN environment variable
 * cannot be decoded. Distinct from a keychain read failure so callers can
 * surface an actionable message that names the env var rather than the
 * keychain.
 */
export class EnvTokenError extends Error {}

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

	public static async uuid(): Promise< string > {
		const service = Token.getServiceName( '-uuid' );

		const keychain = await getKeychain();
		let _uuid = await keychain.getPassword( service );
		if ( ! _uuid ) {
			_uuid = randomUUID();
			await keychain.setPassword( service, _uuid );
		}

		return _uuid;
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

	/**
	 * Returns true when a non-empty VIP_CLI_TOKEN is set in the environment.
	 * When set, it takes precedence over any keychain-stored token.
	 */
	public static isEnvTokenSet(): boolean {
		return Boolean( process.env[ ENV_TOKEN_NAME ]?.trim() );
	}

	public static async get(): Promise< Token > {
		const envToken = process.env[ ENV_TOKEN_NAME ];
		if ( envToken?.trim() ) {
			// The env var supplies the token directly; never touch the keychain.
			try {
				return new Token( envToken );
			} catch ( err ) {
				debug( 'Failed to decode token from %s: %o', ENV_TOKEN_NAME, err );
				throw new EnvTokenError(
					`The token in the ${ ENV_TOKEN_NAME } environment variable is malformed. ` +
						`Provide a valid Personal Access Token from ${ TOKEN_URL }, ` +
						`or unset ${ ENV_TOKEN_NAME } to use the token stored in the keychain.`
				);
			}
		}

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
