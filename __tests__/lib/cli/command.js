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
		it( 'dispatches when child options appear before -- and subcommand follows separator', async () => {
			const parentScript = path.join( process.cwd(), 'src/bin/vip.js' );
			const childScript = path.join( process.cwd(), 'src/bin/vip-wp.js' );

			const cmd = command( { requiredArgs: 0 } ).command( 'wp', 'Run WP-CLI commands.' );

			await cmd.argv( [
				process.execPath,
				parentScript,
				'@jdk-test.production',
				'--yes',
				'--',
				'wp',
				'option',
				'get',
				'home',
			] );

			expect( spawnSync ).toHaveBeenCalledWith(
				process.execPath,
				[ childScript, '@jdk-test.production', '--yes', '--', 'option', 'get', 'home' ],
				{
					stdio: 'inherit',
					env: process.env,
				}
			);
			expect( process.exit ).toHaveBeenCalledWith( 0 );
		} );

		it( 'requires -- separator for wp command arguments', async () => {
			const parentScript = path.join( process.cwd(), 'src/bin/vip.js' );
			const cmd = command( { requiredArgs: 0 } ).command( 'wp', 'Run WP-CLI commands.' );

			await expect(
				cmd.argv( [
					process.execPath,
					parentScript,
					'@docs-multisite.develop',
					'wp',
					'post',
					'list',
					'--post_type=post',
				] )
			).rejects.toThrow( 'process.exit: 1' );

			expect( console.error ).toHaveBeenCalledWith(
				expect.stringContaining(
					'A double dash ("--") must separate the arguments of "vip" from those of "wp".'
				)
			);
			expect( spawnSync ).not.toHaveBeenCalled();
		} );

		it( 'dispatches when argv starts with alias then -- then subcommand', async () => {
			const parentScript = path.join( process.cwd(), 'src/bin/vip.js' );
			const childScript = path.join( process.cwd(), 'src/bin/vip-wp.js' );

			const cmd = command( { requiredArgs: 0 } ).command( 'wp', 'Run WP-CLI commands.' );

			await cmd.argv( [
				process.execPath,
				parentScript,
				'@docs-multisite.develop',
				'--',
				'wp',
				'post',
				'list',
				'--posts_per_page=10',
			] );

			expect( spawnSync ).toHaveBeenCalledWith(
				process.execPath,
				[ childScript, '@docs-multisite.develop', '--', 'post', 'list', '--posts_per_page=10' ],
				{
					stdio: 'inherit',
					env: process.env,
				}
			);
			expect( process.exit ).toHaveBeenCalledWith( 0 );
		} );

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

	describe( 'option parsing', () => {
		it( 'does not duplicate defaults when an explicit value matches the default', async () => {
			const cmd = command( { requiredArgs: 0 } ).option( 'type', 'Log type', 'app' );

			const options = await cmd.argv( [ process.execPath, '/path/to/vip-logs.js', '--type=app' ] );

			expect( options.type ).toBe( 'app' );
			expect( Array.isArray( options.type ) ).toBe( false );
		} );

		it( 'throws on unknown options', async () => {
			const cmd = command( { requiredArgs: 0 } );

			await expect(
				cmd.argv( [ process.execPath, '/path/to/vip-dev-env-logs.js', '--xxx' ] )
			).rejects.toThrow( 'process.exit: 1' );

			expect( console.error ).toHaveBeenCalledWith(
				expect.stringContaining( 'The option "xxx" is unknown.' )
			);
		} );

		it( 'throws on unknown short options', async () => {
			const cmd = command( { requiredArgs: 0 } );

			await expect(
				cmd.argv( [ process.execPath, '/path/to/vip-dev-env-logs.js', '-x' ] )
			).rejects.toThrow( 'process.exit: 1' );

			expect( console.error ).toHaveBeenCalledWith(
				expect.stringContaining( 'The option "x" is unknown.' )
			);
		} );

		it( 'allows unknown options for wildcard commands', async () => {
			const cmd = command( { requiredArgs: 0, wildcardCommand: true } );

			const options = await cmd.argv( [
				process.execPath,
				'/path/to/vip-wp.js',
				'post',
				'list',
				'--post_type=post',
			] );

			expect( options ).toEqual(
				expect.objectContaining( {
					help: false,
					version: false,
				} )
			);

			expect( options ).not.toHaveProperty( 'postType' );
			expect( options ).not.toHaveProperty( 'post_type' );

			expect( console.error ).not.toHaveBeenCalled();
		} );

		it( 'parses short options using equals syntax without prefixing values', async () => {
			const cmd = command( { requiredArgs: 0 } )
				.option( [ 't', 'type' ], 'Log type', 'app' )
				.option( [ 'l', 'limit' ], 'Limit', undefined, parseInt );

			const options = await cmd.argv( [
				process.execPath,
				'/path/to/vip-logs.js',
				'-t=app',
				'-l=5',
			] );

			expect( options.type ).toBe( 'app' );
			expect( options.limit ).toBe( 5 );
		} );
	} );
} );
