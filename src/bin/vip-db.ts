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
	.command( 'phpmyadmin', 'Access a read-only phpMyAdmin console for an environment database.' )
	.example(
		'vip @example-app.develop db phpmyadmin',
		"Access a read-only phpMyAdmin console for the environment's database."
	)
	.argv( process.argv, async () => {
		await trackEvent( 'vip_db_command_execute' );
	} );
