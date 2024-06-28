import { jwtDecode } from 'jwt-decode';
import { v4 as uuid } from 'uuid';

import { API_HOST, PRODUCTION_API_HOST } from './api';
import keychain from './keychain';

interface Payload {
	id?: number;
	iat?: number;
	exp?: number;
}

// Config
export const SERVICE = 'vip-go-cli';
export default class Token {
	private _raw?: string;
	private _id?: number;
	private iat?: Date;
	private exp?: Date;

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

		let _uuid = await keychain.getPassword( service );
		if ( ! _uuid ) {
			_uuid = uuid();
			await keychain.setPassword( service, _uuid );
		}

		return _uuid;
	}

	public static async setUuid( _uuid: string ): Promise< void > {
		const service = Token.getServiceName( '-uuid' );
		await keychain.setPassword( service, _uuid );
	}

	public static set( token: string ): Promise< boolean > {
		const service = Token.getServiceName();

		return keychain.setPassword( service, token );
	}

	public static async get(): Promise< Token > {
		const service = Token.getServiceName();

		const token = ( await keychain.getPassword( service ) ) ?? '';
		return new Token( token );
	}

	public static purge(): Promise< boolean > {
		const service = Token.getServiceName();

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
