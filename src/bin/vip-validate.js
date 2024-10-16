#!/usr/bin/env node

import command from '../lib/cli/command';
import { trackEvent } from '../lib/tracker';

command( {
	requiredArgs: 0,
} )
	.command(
		'preflight',
		'Scan a Node.js codebase on a local machine for potential issues that could prevent successful building or deploying.'
	)
	.argv( process.argv, async () => {
		await trackEvent( 'vip_validate_command_execute' );
	} );
