// @flow

/**
 * External dependencies
 */
import jwtDecode from 'jwt-decode';
import uuid from 'uuid/v1';

/**
 * Internal dependencies
 */
import keychain from './keychain';

// Config
const SERVICE = 'vip-go-cli';

export default class Token {
	raw: string;
	id: number;
	iat: Date;
	exp: Date;

	constructor( token: string ): void {
		if ( ! token || ! token.length ) {
			return;
		}

		const t = jwtDecode( token );
		this.raw = token;

		if ( t.id ) {
			this.id = t.id;
		}

		if ( t.iat ) {
			this.iat = new Date( t.iat * 1000 );
		}

		if ( t.exp ) {
			this.exp = new Date( t.exp * 1000 );
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

	async uuid(): string {
		let _uuid = await keychain.getPassword( SERVICE + '-uuid' );
		if ( ! _uuid ) {
			_uuid = uuid();
			await keychain.setPassword( SERVICE + '-uuid', _uuid );
		}

		return _uuid;
	}

	static async set( token: string ): Promise<boolean> {
		return keychain.setPassword( SERVICE, token );
	}

	static async get(): Promise<Token> {
		const token = await keychain.getPassword( SERVICE );
		return new Token( token );
	}

	static async purge(): Promise<boolean> {
		return keychain.deletePassword( SERVICE );
	}
}
