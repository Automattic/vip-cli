import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';

import command from '../../../src/lib/cli/command';
import { runCommand } from '../../../src/lib/cli/run-command';

jest.mock( '../../../src/lib/cli/run-command', () => ( {
	runCommand: jest.fn( async () => {} ),
} ) );

jest.mock( '../../../src/lib/tracker', () => ( {
	trackEvent: jest.fn(),
} ) );

describe( 'cli parser invocation matrix: wp/alias/separator/options', () => {
	const parentScript = path.join( process.cwd(), 'src/bin/vip.js' );
	const childScript = path.join( process.cwd(), 'src/commands/vip-wp.js' );

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
		},
		{
			desc: 'option-only: wp --path /tmp/wp',
			argv: [ process.execPath, parentScript, 'wp', '--path', '/tmp/wp' ],
			expectedChildArgs: [ '--path', '/tmp/wp' ],
		},
		{
			desc: 'alias before separator: @app -- wp --help',
			argv: [ process.execPath, parentScript, '@myapp', '--', 'wp', '--help' ],
			expectedChildArgs: [ '@myapp', '--', '--help' ],
		},
		{
			desc: 'wp payload: -- wp post list --posts_per_page=10',
			argv: [ process.execPath, parentScript, '--', 'wp', 'post', 'list', '--posts_per_page=10' ],
			expectedChildArgs: [ '--', 'post', 'list', '--posts_per_page=10' ],
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
		},
		{
			desc: 'option before separator: --yes -- wp post list',
			argv: [ process.execPath, parentScript, '--yes', '--', 'wp', 'post', 'list' ],
			expectedChildArgs: [ '--yes', '--', 'post', 'list' ],
		},
		{
			desc: 'alias-shaped payload after separator stays in the payload',
			argv: [ process.execPath, parentScript, 'wp', '--', 'option', 'get', '@literal' ],
			expectedChildArgs: [ '--', 'option', 'get', '@literal' ],
		},
		{
			desc: 'target alias before separator and alias-shaped payload remain distinct',
			argv: [ process.execPath, parentScript, '@myapp', 'wp', '--', 'option', 'get', '@literal' ],
			expectedChildArgs: [ '@myapp', '--', 'option', 'get', '@literal' ],
		},
		{
			desc: 'alias before wp: @app wp --help (should dispatch)',
			argv: [ process.execPath, parentScript, '@myapp', 'wp', '--help' ],
			expectedChildArgs: [ '@myapp', '--help' ],
		},
		{
			desc: 'alias + explicit --app conflict (should dispatch)',
			argv: [ process.execPath, parentScript, '@myapp', '--app', 'other', '--', 'wp', '--help' ],
			expectedChildArgs: [ '@myapp', '--app', 'other', '--', '--help' ],
		},
	] )( '$desc', async ( { argv, expectedChildArgs } ) => {
		const cmd = command( {
			requiredArgs: 0,
			commandDirectory: path.join( process.cwd(), 'src/commands' ),
		} ).command( 'wp', 'Run WP-CLI commands.' );
		await cmd.argv( argv, undefined );
		expect( runCommand ).toHaveBeenCalledWith( childScript, [
			process.execPath,
			childScript,
			...expectedChildArgs,
		] );
		expect( process.exit ).not.toHaveBeenCalled();
	} );

	it.each( [
		{
			desc: 'wp payload: wp post list --posts_per_page=10 (no --)',
			argv: [ process.execPath, parentScript, 'wp', 'post', 'list', '--posts_per_page=10' ],
			expectError: /A double dash/,
			expectExit: 1,
		},
	] )( '$desc', async ( { argv, expectError, expectExit } ) => {
		const cmd = command( {
			requiredArgs: 0,
			commandDirectory: path.join( process.cwd(), 'src/commands' ),
		} ).command( 'wp', 'Run WP-CLI commands.' );
		await expect( cmd.argv( argv, undefined ) ).rejects.toThrow( 'process.exit: ' + expectExit );
		expect( console.error ).toHaveBeenCalledWith( expect.stringMatching( expectError ) );
		expect( runCommand ).not.toHaveBeenCalled();
	} );
} );
