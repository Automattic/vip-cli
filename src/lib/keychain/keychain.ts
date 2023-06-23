export interface Keychain {
	getPassword( service: string ): Promise< string | null >;
	setPassword( service: string, password: string ): Promise< boolean >;
	deletePassword( service: string ): Promise< boolean >;
}

export type KeychainConstructor = new () => Keychain;
