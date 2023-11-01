#!/usr/bin/env node

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import { trackEvent } from '../lib/tracker';

void command( { usage: 'vip db' } )
	.command( 'phpmyadmin', 'Open PhpMyAdmin console for your application database' )
	.example(
		'vip db phpmyadmin @mysite.develop',
		'Open PhpMyAdmin console for your database of the @mysite.develop environment'
	)
	.argv( process.argv, async () => {
		await trackEvent( 'vip_db_command_execute' );
	} );
