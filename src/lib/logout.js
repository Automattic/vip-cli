/**
 * Internal dependencies
 */
import Token from 'lib/token';
import { trackEvent } from 'lib/tracker';
import http from 'lib/api/http';

export default async () => {
	await http( '/logout', { method: 'post' } );

	await Token.purge();

	await trackEvent( 'logout_command_execute' );
};
