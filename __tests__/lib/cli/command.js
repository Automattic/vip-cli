import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import command, { containsAppEnvArgument } from '../../../src/lib/cli/command';

jest.mock( 'node:child_process', () => ( {
	spawnSync: jest.fn( () => ( { status: 0 } ) ),
} ) );

jest.mock( '../../../src/lib/tracker', () => ( {
	trackEvent: jest.fn(),
} ) );

describe( 'utils/cli/command', () => {
	beforeEach( () => {
		jest.clearAllMocks();
		jest.spyOn( process, 'exit' ).mockImplementation( code => {
			if ( code ) {
				throw new Error( `process.exit: ${ code }` );
			}
		} );
		jest.spyOn( console, 'error' ).mockImplementation( () => {} );
		jest.spyOn( console, 'log' ).mockImplementation( () => {} );
	} );

	afterEach( () => {
		jest.restoreAllMocks();
	} );

	describe( 'containsAppEnvArgument', () => {
		it.each( [
			[ [ 'test', 'one' ], false ],
			[ [ 'test', '@123', 'dev-env' ], true ],
			[ [ 'test', '@123.develop', 'dev-env' ], true ],
			[ [ 'test', '--app', '123', 'dev-env' ], true ],
		] )( 'should identify app/env arguments - %p', ( argv, expected ) => {
			const result = containsAppEnvArgument( argv );
			expect( result ).toBe( expected );
		} );
	} );

	describe( 'subcommand dispatch', () => {
		it( 'forwards parent-level options and command payload to nested subcommands', async () => {
			const parentScript = path.join( process.cwd(), 'src/bin/vip-dev-env.js' );
			const childScript = path.join( process.cwd(), 'src/bin/vip-dev-env-shell.js' );
			const commandPayload = [
				'curl',
				'-X',
				'PUT',
				'http://elasticsearch:9200/_snapshot/gtf',
				'-H',
				'Content-Type: application/json',
				'-d',
				'{ "type": "fs", "settings":{ "location": "/usr/share/elasticsearch/data/gtf",  "compress": true } }',
			];

			const cmd = command( { requiredArgs: 0 } ).command(
				'shell',
				'Create a shell and run commands against a local environment.'
			);

			await cmd.argv( [
				process.execPath,
				parentScript,
				'--slug=what-mu',
				'shell',
				'--',
				...commandPayload,
			] );

			expect( spawnSync ).toHaveBeenCalledWith(
				process.execPath,
				[ childScript, '--slug=what-mu', '--', ...commandPayload ],
				{
					stdio: 'inherit',
					env: process.env,
				}
			);
			expect( process.exit ).toHaveBeenCalledWith( 0 );
		} );
	} );
} );
