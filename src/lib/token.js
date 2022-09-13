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
	raw;
	id;
	iat;
	exp;

	constructor( token ) {
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

	valid() {
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

	expired() {
		if ( ! this.exp ) {
			return false;
		}

		const now = new Date();
		return now > this.exp;
	}

	static async uuid() {
		const service = Token.getServiceName( '-uuid' );

		let _uuid = await keychain.getPassword( service );
		if ( ! _uuid ) {
			_uuid = uuid();
			await keychain.setPassword( service, _uuid );
		}

		return _uuid;
	}

	static async setUuid( _uuid ) {
		const service = Token.getServiceName( '-uuid' );
		await keychain.setPassword( service, _uuid );
	}

	static async set( token ) {
		const service = Token.getServiceName();

		return keychain.setPassword( service, token );
	}

	static async get() {
		const service = Token.getServiceName();

		const token = await keychain.getPassword( service );
		return new Token( token );
	}

	static async purge() {
		const service = Token.getServiceName();

		return keychain.deletePassword( service );
	}

	static getServiceName( modifier = '' ) {
		let service = SERVICE;

		if ( PRODUCTION_API_HOST !== API_HOST ) {
			const sanitized = API_HOST.replace( /[^a-z0-9]/gi, '-' );

			service = `${ SERVICE }:${ sanitized }`;
		}

		return `${ service }${ modifier }`;
	}
}
