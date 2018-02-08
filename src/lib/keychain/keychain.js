// @flow

export interface Keychain {
	getPassword( service: string ): Promise<string>;
	setPassword( service: string, password: string ): Promise<boolean>;
	deletePassword( service: string ): Promise<boolean>;
}
