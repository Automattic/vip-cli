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
	.command( 'sql', 'Import SQL to your database from a file' )
	.example( 'vip export sql @mysite.develop', 'Export SQL file from your site' )
	.argv( process.argv, async () => {
		await trackEvent( 'vip_export_command_execute' );
	} );
