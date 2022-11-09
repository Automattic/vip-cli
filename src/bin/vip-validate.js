#!/usr/bin/env node

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { trackEvent } from 'lib/tracker';

command( {
	requiredArgs: 1,
} )
	.command( 'preflight', 'Runs preflight tests to validate if your application is ready to be deployed' )
	.argv( process.argv, async () => {
		await trackEvent( 'vip_validate_command_execute' );
	} );
