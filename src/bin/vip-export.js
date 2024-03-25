#!/usr/bin/env node

import command from '../lib/cli/command';
import { trackEvent } from '../lib/tracker';

command()
	.command( 'sql', 'Generate a copy of a database backup for an environment and download it as an archived SQL file.' )
	.example(
		'vip @example-app.develop export sql',
		'Download a copy of the most recent database backup for an environment as an archived SQL file to the current local directory.'
	)
	.argv( process.argv, async () => {
		await trackEvent( 'vip_export_command_execute' );
	} );
