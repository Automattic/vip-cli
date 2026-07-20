import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import command from '../../../src/lib/cli/command';

jest.mock( 'node:child_process', () => ( {
	spawnSync: jest.fn( () => ( { status: 0 } ) ),
} ) );

jest.mock( '../../../src/lib/tracker', () => ( {
	trackEvent: jest.fn(),
} ) );

describe( 'cli parser invocation matrix: wp/alias/separator/options', () => {
	const parentScript = path.join( process.cwd(), 'src/bin/vip.js' );
	const childScript = path.join( process.cwd(), 'src/bin/vip-wp.js' );

	beforeEach( () => {
		jest.clearAllMocks();
		// For nonzero exit codes, throw to allow error-path assertions. For zero, return a JS never-cast.
		jest.spyOn( process, 'exit' ).mockImplementation( code => {
			if ( code ) {
				throw new Error( `process.exit: ${ code }` );
			}
			// JSDoc-cast to never for JS-only test: satisfies Jest and disables further execution.
			return /** @type {never} */ ( undefined );
		} );
		jest.spyOn( console, 'error' ).mockImplementation( () => {} );
		jest.spyOn( console, 'log' ).mockImplementation( () => {} );
	} );
	afterEach( () => {
		jest.restoreAllMocks();
	} );

	it.each( [
		{
			desc: 'option-only: wp --help',
			argv: [ process.execPath, parentScript, 'wp', '--help' ],
			expectedChildArgs: [ '--help' ],
			expectExit: 0,
		},
		{
			desc: 'option-only: wp --path /tmp/wp',
			argv: [ process.execPath, parentScript, 'wp', '--path', '/tmp/wp' ],
			expectedChildArgs: [ '--path', '/tmp/wp' ],
			expectExit: 0,
		},
		{
			desc: 'alias before separator: @app -- wp --help',
			argv: [ process.execPath, parentScript, '@myapp', '--', 'wp', '--help' ],
			expectedChildArgs: [ '@myapp', '--', '--help' ],
			expectExit: 0,
		},
		{
			desc: 'wp payload: -- wp post list --posts_per_page=10',
			argv: [ process.execPath, parentScript, '--', 'wp', 'post', 'list', '--posts_per_page=10' ],
			expectedChildArgs: [ '--', 'post', 'list', '--posts_per_page=10' ],
			expectExit: 0,
		},
		{
			desc: 'alias + payload: @app -- wp post list --posts_per_page=10',
			argv: [
				process.execPath,
				parentScript,
				'@myapp',
				'--',
				'wp',
				'post',
				'list',
				'--posts_per_page=10',
			],
			expectedChildArgs: [ '@myapp', '--', 'post', 'list', '--posts_per_page=10' ],
			expectExit: 0,
		},
		{
			desc: 'option before separator: --yes -- wp post list',
			argv: [ process.execPath, parentScript, '--yes', '--', 'wp', 'post', 'list' ],
			expectedChildArgs: [ '--yes', '--', 'post', 'list' ],
			expectExit: 0,
		},
		{
			desc: 'alias before wp: @app wp --help (should dispatch)',
			argv: [ process.execPath, parentScript, '@myapp', 'wp', '--help' ],
			expectedChildArgs: [ '@myapp', '--help' ],
			expectExit: 0,
		},
		{
			desc: 'alias + explicit --app conflict (should dispatch)',
			argv: [ process.execPath, parentScript, '@myapp', '--app', 'other', '--', 'wp', '--help' ],
			expectedChildArgs: [ '@myapp', '--app', 'other', '--', '--help' ],
			expectExit: 0,
		},
	] )( '$desc', async ( { argv, expectedChildArgs, expectExit } ) => {
		const cmd = command( { requiredArgs: 0 } ).command( 'wp', 'Run WP-CLI commands.' );
		await cmd.argv( argv, undefined );
		expect( spawnSync ).toHaveBeenCalledWith(
			process.execPath,
			[ childScript, ...expectedChildArgs ],
			expect.objectContaining( { stdio: 'inherit', env: process.env } )
		);
		expect( process.exit ).toHaveBeenCalledWith( expectExit );
	} );

	it.each( [
		{
			desc: 'wp payload: wp post list --posts_per_page=10 (no --)',
			argv: [ process.execPath, parentScript, 'wp', 'post', 'list', '--posts_per_page=10' ],
			expectError: /A double dash/,
			expectExit: 1,
		},
	] )( '$desc', async ( { argv, expectError, expectExit } ) => {
		const cmd = command( { requiredArgs: 0 } ).command( 'wp', 'Run WP-CLI commands.' );
		await expect( cmd.argv( argv, undefined ) ).rejects.toThrow( 'process.exit: ' + expectExit );
		expect( console.error ).toHaveBeenCalledWith( expect.stringMatching( expectError ) );
		expect( spawnSync ).not.toHaveBeenCalled();
	} );
} );
