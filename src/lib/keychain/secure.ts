import keytar from '@postman/node-keytar';

import type { Keychain } from './keychain';

export default class Secure implements Keychain {
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
