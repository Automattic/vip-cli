import chalk from 'chalk';

import http from '../lib/api/http';
import tokenCache from '../lib/rechallenge/token-cache';
import Token, { ENV_TOKEN_NAME } from '../lib/token';
import { trackEvent } from '../lib/tracker';

export default async (): Promise< void > => {
	try {
		// VIP_CLI_TOKEN is user-managed: logout must not invalidate it server-side.
		if ( ! Token.isEnvTokenSet() ) {
			await http( '/logout', { method: 'post' } );
		}
	} finally {
		await Token.purge();
		await tokenCache.clearAll();
	}

	// Purging the keychain does not clear the env var, so the CLI would remain
	// authenticated via VIP_CLI_TOKEN. Tell the user how to fully log out.
	if ( Token.isEnvTokenSet() ) {
		console.log(
			chalk.yellow(
				`Note: ${ ENV_TOKEN_NAME } is still set in your environment and continues to authenticate ` +
					`VIP-CLI. Unset ${ ENV_TOKEN_NAME } to fully log out.`
			)
		);
	}

	await trackEvent( 'logout_command_execute' );
};
