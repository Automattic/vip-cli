#!/usr/bin/env node

import command from '../lib/cli/command';

command( { usage: 'vip internal' } )
	.command( 'is-logged-in', 'Check if the user is logged in' )
	.command( 'fetch-integrations', 'Fetch integrations for the given environment' )
	.argv( process.argv );
