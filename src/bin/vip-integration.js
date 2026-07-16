#!/usr/bin/env node

import command from '../lib/cli/command';

command( {
	requiredArgs: 0,
	usage: 'vip integration',
} )
	.command( 'validate', 'Check a VIP integration for conformance before submitting it.' )
	.argv( process.argv );
