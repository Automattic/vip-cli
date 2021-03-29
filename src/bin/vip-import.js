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
	.example( 'vip import sql @mysite.develop <file.sql>', 'Import the given SQL file to your site' )
	.command( 'media', 'Import media files to your application from a compressed archive' )
	.argv( process.argv, async () => {
		await trackEvent( 'vip_import_command_execute' );
	} );
