#!/usr/bin/env node

import command from '../lib/cli/command';
import { trackEvent } from '../lib/tracker';

void command( { usage: 'vip backup' } )
	.command( 'db', 'Generate a fresh database backup for an environment.' )
	.example(
		'vip @example-app.develop backup db\n' +
			'      Generating a new database backup...\n' +
			'      ✓ Preparing for backup generation\n' +
			'      ✓ Generating backup\n' +
			'      New database backup created',
		'Generate a fresh database backup for an environment.'
	)
	.argv( process.argv, async () => {
		await trackEvent( 'vip_backup_command_execute' );
	} );
