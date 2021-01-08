#!/usr/bin/env node

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { trackEvent } from 'lib/tracker';

command( )
	.command( 'sql', 'Import SQL to your database from a file' )
	.command( 'validate-sql', 'Validate your SQL dump' )
	.command( 'validate-files', 'Validate your media file library' )
	.argv( process.argv, async () => {
		await trackEvent( 'vip_import_command_execute' );
	} );
