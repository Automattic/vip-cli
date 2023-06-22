#!/usr/bin/env node

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import { trackEvent } from '../lib/tracker';

command()
	.command( 'sql', 'Export the contents of your database to an SQL file' )
	.example(
		'vip export sql @mysite.develop',
		'Export the contents of your database to an SQL file'
	)
	.argv( process.argv, async () => {
		await trackEvent( 'vip_export_command_execute' );
	} );
