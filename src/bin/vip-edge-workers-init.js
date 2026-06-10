#!/usr/bin/env node

import path from 'node:path';

import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { CONVENTIONAL_PROJECT_DIR } from '../lib/edge-workers/project';
import { getToolchain } from '../lib/edge-workers/toolchains';
import { DEFAULT_EDGE_WORKER_TYPE, SUPPORTED_EDGE_WORKER_TYPES } from '../lib/edge-workers/types';
import { trackEvent } from '../lib/tracker';

const usage = 'vip edge-workers init';

const examples = [
	{
		usage: 'vip edge-workers init',
		description: `Scaffold a new edge-workers project in ./${ CONVENTIONAL_PROJECT_DIR }.`,
	},
	{
		usage: 'vip edge-workers init ./infra/edge --type=assemblyscript',
		description: 'Scaffold a project at a custom path with an explicit toolchain.',
	},
];

export async function edgeWorkersInitCommand( args = [], opt = {} ) {
	const type = opt.type || DEFAULT_EDGE_WORKER_TYPE;
	const targetArg = args[ 0 ] || CONVENTIONAL_PROJECT_DIR;
	const projectDir = path.resolve( process.cwd(), targetArg );

	await trackEvent( 'edge_workers_init_command_execute', { type } );

	if ( ! SUPPORTED_EDGE_WORKER_TYPES.includes( type ) ) {
		await trackEvent( 'edge_workers_init_command_error', { type, error: 'Unsupported type' } );
		exit.withError(
			`Unsupported type "${ type }". Supported types: ${ SUPPORTED_EDGE_WORKER_TYPES.join(
				', '
			) }.`
		);
	}

	try {
		getToolchain( type ).scaffoldProject( projectDir );
	} catch ( err ) {
		await trackEvent( 'edge_workers_init_command_error', { type, error: err.message } );
		exit.withError( err.message );
	}

	await trackEvent( 'edge_workers_init_command_success', { type } );

	console.log( `✓ Created a new ${ type } edge-workers project in ${ projectDir }` );
	console.log( '\nNext steps:' );
	console.log( `  cd ${ targetArg }` );
	console.log( '  npm install' );
	console.log( '  vip edge-workers new my-worker' );
}

command( {
	requiredArgs: 0,
	usage,
} )
	.option(
		'type',
		`The worker toolchain to scaffold. Accepts ${ SUPPORTED_EDGE_WORKER_TYPES.join(
			', '
		) }. Default is "${ DEFAULT_EDGE_WORKER_TYPE }".`,
		DEFAULT_EDGE_WORKER_TYPE
	)
	.examples( examples )
	.argv( process.argv, edgeWorkersInitCommand );
