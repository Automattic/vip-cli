#!/usr/bin/env node

import command from '../lib/cli/command';

command( {
	requiredArgs: 1,
} )
	.command( 'purge-url', 'Purge page cache' )
	.argv( process.argv );
