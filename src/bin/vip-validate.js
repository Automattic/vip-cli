#!/usr/bin/env node

import command from '../lib/cli/command';
import { trackEvent } from '../lib/tracker';

command( {
	requiredArgs: 0,
} )
	.command(
		'preflight',
		'Run a full suite of validation tests against a local Node.js codebase to identify potential issues that could prevent successful building or deploying.'
	)
	.argv( process.argv, async () => {
		await trackEvent( 'vip_validate_command_execute' );
	} );
