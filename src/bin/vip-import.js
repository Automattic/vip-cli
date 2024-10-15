#!/usr/bin/env node

import command from '../lib/cli/command';
import { trackEvent } from '../lib/tracker';

command()
	.command( 'sql', 'Import a SQL database file to an environment.' )
	.command( 'validate-sql', 'Validate a local SQL database file prior to import.' )
	.command(
		'validate-files',
		'Validate the directory structure and contents of a local media file directory prior to archiving and uploading it to a publicly accessible URL.'
	)
	.command(
		'media',
		'Import media files to an environment from an archived file located at a publicly accessible URL.'
	)
	.example(
		'vip @example-app.develop import sql example-file.sql',
		'Import the local SQL database file "example-file.sql" to the develop environment.'
	)
	.example(
		'vip @example-app.production import media https://www.example.com/uploads.tar.gz',
		'Import an archived file from a publicly accessible URL to the production environment.'
	)
	.argv( process.argv, async () => {
		await trackEvent( 'vip_import_command_execute' );
	} );
