#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import { trackEvent } from '../lib/tracker';

command( {
	requiredArgs: 1,
} )
	.command( 'sql', 'Sync local database with a production environment' )
	.argv( process.argv, async () => {
		await trackEvent( 'dev_env_sync_command_execute' );
	} );
