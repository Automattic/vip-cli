// @flow
const jwtDecode = require( 'jwt-decode' );

// ours
const keychain = require( './keychain' );

// Config
const SERVICE = 'vip-go-cli';

class Token {
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
		this.id = t.id;
		this.iat = new Date( t.iat * 1000 );
		this.exp = new Date( t.exp * 1000 );
	}

	valid(): boolean {
		const now = new Date();
		return now > this.iat && now < this.exp;
	}

	expired(): boolean {
		const now = new Date();
		return now > this.exp;
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

module.exports = Token;
