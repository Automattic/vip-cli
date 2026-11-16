import http from '../lib/api/http';
import tokenCache from '../lib/rechallenge/token-cache';
import Token, { ENV_TOKEN_NAME } from '../lib/token';
import { trackEvent } from '../lib/tracker';

export default async (): Promise< void > => {
	if ( Token.isEnvironmentSet() ) {
		console.log(
			`The ${ ENV_TOKEN_NAME } environment variable is still active. Unset it to stop authenticating with that token; stored credentials were left untouched.`
		);
		return;
	}

	try {
		await http( '/logout', { method: 'post' } );
	} finally {
		await Token.purge();
		await tokenCache.clearAll();
	}

	await trackEvent( 'logout_command_execute' );
};
