/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import { trackEvent } from '../lib/tracker';

export default command( { usage: 'vip db' } )
	.command(
		'phpmyadmin',
		'Generate access to a read-only phpMyAdmin web interface for an environment database.'
	)
	.example(
		'vip @example-app.develop db phpmyadmin',
		"Generate access to a read-only phpMyAdmin web interface for the environment's database."
	)
	.argv( process.argv, async () => {
		await trackEvent( 'vip_db_command_execute' );
	} );
