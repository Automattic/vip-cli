import { createRequire } from 'node:module';

import { getBundledResourceRoot, loadBundledPackage } from '../cli/standalone-resources';

import type { Keychain } from './keychain';

type Keytar = {
	getPassword( service: string, account: string ): Promise< string | null >;
	setPassword( service: string, account: string, password: string ): Promise< void >;
	deletePassword( service: string, account: string ): Promise< boolean >;
};
const keytar: Keytar = getBundledResourceRoot()
	? loadBundledPackage< Keytar >( '@github/keytar' )
	: ( createRequire( __filename )( '@github/keytar' ) as Keytar );

export class Secure implements Keychain {
	public getPassword( service: string ): Promise< string | null > {
		return keytar.getPassword( service, service );
	}

	public async setPassword( service: string, password: string ): Promise< boolean > {
		await keytar.setPassword( service, service, password );
		return true;
	}

	public deletePassword( service: string ): Promise< boolean > {
		return keytar.deletePassword( service, service );
	}
}
