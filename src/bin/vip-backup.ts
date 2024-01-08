#!/usr/bin/env node

import command from '../lib/cli/command';
import { trackEvent } from '../lib/tracker';

void command( { usage: 'vip backup' } )
	.command( 'db', 'Trigger a new backup for your database' )
	.example(
		'vip backup db @mysite.develop',
		'Trigger a new backup for your database of the @mysite.develop environment'
	)
	.argv( process.argv, async () => {
		await trackEvent( 'vip_backup_command_execute' );
	} );
