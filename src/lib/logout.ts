import http from '../lib/api/http';
import tokenCache from '../lib/rechallenge/token-cache';
import Token from '../lib/token';
import { trackEvent } from '../lib/tracker';

export default async (): Promise< void > => {
	await http( '/logout', { method: 'post' } );

	await Token.purge();
	await tokenCache.clearAll();

	await trackEvent( 'logout_command_execute' );
};
