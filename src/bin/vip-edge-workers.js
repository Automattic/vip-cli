#!/usr/bin/env node

import command from '../lib/cli/command';

command( {
	requiredArgs: 0,
} )
	.command( 'init', 'Scaffold a new edge-workers project.' )
	.command( 'new', 'Add a new worker to an edge-workers project.' )
	.command( 'build', 'Compile worker(s) to WebAssembly locally.' )
	.command( 'validate', 'Validate worker(s) against an environment without deploying.' )
	.command( 'list', 'List the edge workers deployed to an environment.' )
	.command( 'get', 'Retrieve details for a single deployed edge worker.' )
	.command( 'deploy', 'Compile and deploy a worker to an environment.' )
	.command( 'enable', 'Enable a deployed edge worker.' )
	.command( 'disable', 'Disable a deployed edge worker.' )
	.command( 'delete', 'Permanently delete a deployed edge worker.' )
	.argv( process.argv );
