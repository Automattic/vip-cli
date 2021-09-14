// @flow

/**
 * External dependencies
 */
import jwtDecode from 'jwt-decode';
import { v4 as uuid } from 'uuid';

/**
 * Internal dependencies
 */
import keychain from './keychain';

import {
	API_HOST,
	PRODUCTION_API_HOST,
} from './api';

// Config
export const SERVICE = 'vip-go-cli';
export default class Token {
	raw: string;
	id: number;
	iat: Date;
	exp: Date;

	constructor( token: string ): void {
		if ( ! token ) {
			return;
		}

		token = token.trim();
		if ( ! token.length ) {
			return;
		}

		const decodedToken = jwtDecode( token );
		this.raw = token;

		if ( decodedToken.id ) {
			this.id = decodedToken.id;
		}

		if ( decodedToken.iat ) {
			this.iat = new Date( decodedToken.iat * 1000 );
		}

		if ( decodedToken.exp ) {
			this.exp = new Date( decodedToken.exp * 1000 );
		}
	}

	valid(): boolean {
		if ( ! this.id ) {
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

	expired(): boolean {
		if ( ! this.exp ) {
			return false;
		}

		const now = new Date();
		return now > this.exp;
	}

	static async uuid(): string {
		const service = Token.getServiceName( '-uuid' );

		let _uuid = await keychain.getPassword( service );
		if ( ! _uuid ) {
			_uuid = uuid();
			await keychain.setPassword( service, _uuid );
		}

		return _uuid;
	}

	static async setUuid( _uuid: string ) {
		const service = Token.getServiceName( '-uuid' );
		await keychain.setPassword( service, _uuid );
	}

	static async set( token: string ): Promise<boolean> {
		const service = Token.getServiceName();

		return keychain.setPassword( service, token );
	}

	static async get(): Promise<Token> {
		const service = Token.getServiceName();

		const token = await keychain.getPassword( service );
		return new Token( token );
	}

	static async purge(): Promise<boolean> {
		const service = Token.getServiceName();

		return keychain.deletePassword( service );
	}

	static getServiceName( modifier: string = '' ): string {
		let service = SERVICE;

		if ( PRODUCTION_API_HOST !== API_HOST ) {
			const sanitized = API_HOST.replace( /[^a-z0-9]/gi, '-' );

			service = `${ SERVICE }:${ sanitized }`;
		}

		return `${ service }${ modifier }`;
	}
}
