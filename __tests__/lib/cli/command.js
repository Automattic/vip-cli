import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';

import command, { containsAppEnvArgument } from '../../../src/lib/cli/command';
import { runCommand } from '../../../src/lib/cli/run-command';

jest.mock( '../../../src/lib/cli/run-command', () => ( {
	runCommand: jest.fn( async () => {} ),
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
		it( 'allows wp option-only invocations without separator', async () => {
			const parentScript = path.join( process.cwd(), 'src/bin/vip.js' );
			const childScript = path.join( process.cwd(), 'src/commands/vip-wp.js' );

			const cmd = command( {
				requiredArgs: 0,
				commandDirectory: path.join( process.cwd(), 'src/commands' ),
			} ).command( 'wp', 'Run WP-CLI commands.' );

			await cmd.argv( [ process.execPath, parentScript, 'wp', '--help' ] );

			expect( runCommand ).toHaveBeenCalledWith( childScript, [
				process.execPath,
				childScript,
				'--help',
			] );
			expect( process.exit ).not.toHaveBeenCalled();
		} );

		it( 'allows wp option-only invocations with option values without separator', async () => {
			const parentScript = path.join( process.cwd(), 'src/bin/vip.js' );
			const childScript = path.join( process.cwd(), 'src/commands/vip-wp.js' );

			const cmd = command( {
				requiredArgs: 0,
				commandDirectory: path.join( process.cwd(), 'src/commands' ),
			} ).command( 'wp', 'Run WP-CLI commands.' );

			await cmd.argv( [ process.execPath, parentScript, 'wp', '--path', '/tmp/wp' ] );

			expect( runCommand ).toHaveBeenCalledWith( childScript, [
				process.execPath,
				childScript,
				'--path',
				'/tmp/wp',
			] );
			expect( process.exit ).not.toHaveBeenCalled();
		} );

		it( 'dispatches when child options appear before -- and subcommand follows separator', async () => {
			const parentScript = path.join( process.cwd(), 'src/bin/vip.js' );
			const childScript = path.join( process.cwd(), 'src/commands/vip-wp.js' );

			const cmd = command( {
				requiredArgs: 0,
				commandDirectory: path.join( process.cwd(), 'src/commands' ),
			} ).command( 'wp', 'Run WP-CLI commands.' );

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

			expect( runCommand ).toHaveBeenCalledWith( childScript, [
				process.execPath,
				childScript,
				'@jdk-test.production',
				'--yes',
				'--',
				'option',
				'get',
				'home',
			] );
			expect( process.exit ).not.toHaveBeenCalled();
		} );

		it( 'requires -- separator for wp command arguments', async () => {
			const parentScript = path.join( process.cwd(), 'src/bin/vip.js' );
			const cmd = command( {
				requiredArgs: 0,
				commandDirectory: path.join( process.cwd(), 'src/commands' ),
			} ).command( 'wp', 'Run WP-CLI commands.' );

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
			expect( runCommand ).not.toHaveBeenCalled();
		} );

		it( 'dispatches when argv starts with alias then -- then subcommand', async () => {
			const parentScript = path.join( process.cwd(), 'src/bin/vip.js' );
			const childScript = path.join( process.cwd(), 'src/commands/vip-wp.js' );

			const cmd = command( {
				requiredArgs: 0,
				commandDirectory: path.join( process.cwd(), 'src/commands' ),
			} ).command( 'wp', 'Run WP-CLI commands.' );

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

			expect( runCommand ).toHaveBeenCalledWith( childScript, [
				process.execPath,
				childScript,
				'@docs-multisite.develop',
				'--',
				'post',
				'list',
				'--posts_per_page=10',
			] );
			expect( process.exit ).not.toHaveBeenCalled();
		} );

		it( 'forwards parent-level options and command payload to nested subcommands', async () => {
			const parentScript = path.join( process.cwd(), 'src/commands/vip-dev-env.js' );
			const childScript = path.join( process.cwd(), 'src/commands/vip-dev-env-shell.js' );
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

			const cmd = command( {
				requiredArgs: 0,
				commandDirectory: path.join( process.cwd(), 'src/commands' ),
			} ).command( 'shell', 'Create a shell and run commands against a local environment.' );

			await cmd.argv( [
				process.execPath,
				parentScript,
				'--slug=what-mu',
				'shell',
				'--',
				...commandPayload,
			] );

			expect( runCommand ).toHaveBeenCalledWith( childScript, [
				process.execPath,
				childScript,
				'--slug=what-mu',
				'--',
				...commandPayload,
			] );
			expect( process.exit ).not.toHaveBeenCalled();
		} );
	} );

	describe( 'option parsing', () => {
		it( 'keeps options on each command instance', async () => {
			const formatted = command( { format: true, requiredArgs: 0 } );
			const positional = command( { format: false, requiredArgs: 1 } );

			await formatted.argv(
				[ process.execPath, '/path/to/vip-app-list.js', '--format=json' ],
				async () => []
			);
			expect( console.log ).toHaveBeenCalledWith( '[]' );

			await positional.argv( [ process.execPath, '/path/to/vip-app.js' ], async () => {
				throw new Error( 'missing positional argument reached handler' );
			} );
			expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'Usage:' ) );
		} );

		it( 'prints valid empty JSON from the real formatted command wrapper', async () => {
			const cmd = command( { format: true, requiredArgs: 0 } );

			await cmd.argv(
				[ process.execPath, '/path/to/vip-edge-workers-list.js', '--format=json' ],
				async () => []
			);

			expect( console.log ).toHaveBeenCalledWith( '[]' );
		} );

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
