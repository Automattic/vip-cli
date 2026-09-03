import debugLib from 'debug';

import http from '../lib/api/http';
import tokenCache from '../lib/rechallenge/token-cache';
import Token from '../lib/token';
import { trackEvent } from '../lib/tracker';

const debug = debugLib( '@automattic/vip:logout' );

export default async (): Promise< void > => {
	try {
		// Server-side logout is skipped when the stored token cannot be read
		// (e.g. a locked OS keychain over SSH) or is not valid — there is
		// nothing usable to send.
		let storedToken;
		try {
			storedToken = await Token.get();
		} catch ( err ) {
			debug( 'Skipping server-side logout; could not read the stored token:', err );
		}

		if ( storedToken?.valid() ) {
			await http( '/logout', { method: 'post' } );
		}
	} finally {
		try {
			await Token.purge();
		} catch ( err ) {
			debug( 'Could not purge the stored token from the keychain:', err );
		}

		await tokenCache.clearAll();
	}

	await trackEvent( 'logout_command_execute' );
};
