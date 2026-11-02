import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import util from 'node:util';

import command, {
	containsAppEnvArgument,
	formatFatalError,
	uncaughtError,
} from '../../../src/lib/cli/command';
import * as exit from '../../../src/lib/cli/exit';
import UserError from '../../../src/lib/user-error';

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
		it( 'allows wp option-only invocations without separator', async () => {
			const parentScript = path.join( process.cwd(), 'src/bin/vip.js' );
			const childScript = path.join( process.cwd(), 'src/bin/vip-wp.js' );

			const cmd = command( { requiredArgs: 0 } ).command( 'wp', 'Run WP-CLI commands.' );

			await cmd.argv( [ process.execPath, parentScript, 'wp', '--help' ] );

			expect( spawnSync ).toHaveBeenCalledWith( process.execPath, [ childScript, '--help' ], {
				stdio: 'inherit',
				env: process.env,
			} );
			expect( process.exit ).toHaveBeenCalledWith( 0 );
		} );

		it( 'allows wp option-only invocations with option values without separator', async () => {
			const parentScript = path.join( process.cwd(), 'src/bin/vip.js' );
			const childScript = path.join( process.cwd(), 'src/bin/vip-wp.js' );

			const cmd = command( { requiredArgs: 0 } ).command( 'wp', 'Run WP-CLI commands.' );

			await cmd.argv( [ process.execPath, parentScript, 'wp', '--path', '/tmp/wp' ] );

			expect( spawnSync ).toHaveBeenCalledWith(
				process.execPath,
				[ childScript, '--path', '/tmp/wp' ],
				{
					stdio: 'inherit',
					env: process.env,
				}
			);
			expect( process.exit ).toHaveBeenCalledWith( 0 );
		} );

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

	describe( 'formatFatalError', () => {
		it( 'redacts the input of a native invalid URL error', () => {
			let err;
			try {
				new URL( 'http://proxy-user:proxy-password@%' );
			} catch ( error ) {
				err = error;
			}

			expect( err?.code ).toBe( 'ERR_INVALID_URL' );
			const result = formatFatalError( err );
			expect( result ).toContain( 'ERR_INVALID_URL' );
			expect( result ).toContain( '[REDACTED]' );
			expect( result ).not.toContain( 'proxy-password' );
			expect( result ).not.toContain( 'proxy-user' );
		} );

		it( 'redacts URL credentials and sensitive query parameters in stacks', () => {
			const err = new Error(
				'http://proxy-user:proxy-password@example.test/?access_token=query-secret'
			);

			const result = formatFatalError( err );
			expect( result ).toContain( 'example.test' );
			for ( const secret of [ 'proxy-user', 'proxy-password', 'query-secret' ] ) {
				expect( result ).not.toContain( secret );
			}
		} );

		it( 'preserves circular diagnostics without retaining nested secrets', () => {
			const detail = { password: 'circular-secret', reason: 'connection failed' };
			detail.self = detail;

			const result = formatFatalError( detail );
			expect( result ).toContain( 'connection failed' );
			expect( result ).toContain( '[Circular' );
			expect( result ).not.toContain( 'circular-secret' );
		} );

		describe.each( [
			[ 'an Error', value => Object.defineProperty( new Error( 'outer' ), 'detail', { value } ) ],
			[ 'a plain object', value => Object.defineProperty( {}, 'detail', { value } ) ],
			[
				'an error cause',
				value => new Error( 'outer', { cause: Object.defineProperty( {}, 'detail', { value } ) } ),
			],
			[
				'an error code',
				value =>
					Object.assign( new Error( 'outer' ), {
						code: Object.defineProperty( {}, 'detail', { value } ),
					} ),
			],
		] )( 'non-enumerable diagnostics on %s', ( _label, makeValue ) => {
			it.each( [ false, true ] )(
				'includes hidden details with a throwing inspector: %s',
				throwing => {
					const value = makeValue( 'diagnostic details' );
					if ( throwing ) {
						const target = value.cause ?? value.code ?? value;
						target[ util.inspect.custom ] = () => {
							throw new Error( 'inspection failed' );
						};
					}

					expect( formatFatalError( value ) ).toContain( 'diagnostic details' );
				}
			);
		} );

		it( 'includes the message and stack of a plain Error', () => {
			const err = new Error( 'boom' );

			const result = formatFatalError( err );

			expect( result ).toContain( 'boom' );
			// A normal Error has real stack frames.
			expect( result ).toMatch( /\n\s+at\s/ );
			// No inspect dump needed when the stack has frames and there are no extra props.
			expect( result ).not.toContain( '[Error: boom]' );
		} );

		it.each( [ TypeError, RangeError ] )( 'does not duplicate a %s stack', ErrorType => {
			const err = new ErrorType( 'boom' );
			expect( formatFatalError( err ) ).toBe( err.stack );
		} );

		it( 'still includes extra properties on error subclasses', () => {
			const err = Object.assign( new TypeError( 'boom' ), { detail: 'diagnostic detail' } );
			expect( formatFatalError( err ) ).toContain( 'diagnostic detail' );
		} );

		it( 'appends an inspect dump for a stack-less bare native-style error', () => {
			// keytar-style rejection: an Error whose stack is only the message line.
			const err = new Error( 'An unknown error occurred.' );
			err.stack = 'Error: An unknown error occurred.';

			const result = formatFatalError( err );

			expect( result ).toContain( 'An unknown error occurred.' );
			// The inspect dump renders the Error representation.
			expect( result ).toContain( '[Error: An unknown error occurred.]' );
		} );

		it( 'returns String() for a non-Error thrown value', () => {
			expect( formatFatalError( 'just a string' ) ).toBe( 'just a string' );
			expect( formatFatalError( 42 ) ).toBe( '42' );
		} );

		it( 'inspects object-shaped non-Error rejections instead of printing [object Object]', () => {
			const result = formatFatalError( { code: 'ECONNRESET', detail: 'socket hang up' } );

			expect( result ).not.toContain( '[object Object]' );
			expect( result ).toContain( 'ECONNRESET' );
			expect( result ).toContain( 'socket hang up' );
		} );

		it( 'includes the code property when present', () => {
			const err = new Error( 'connection failed' );
			err.code = 'ECONNREFUSED';

			const result = formatFatalError( err );

			expect( result ).toContain( 'connection failed' );
			expect( result ).toContain( 'ECONNREFUSED' );
			// An extra own property triggers the inspect dump so it is not lost.
			expect( result ).toContain( "code: 'ECONNREFUSED'" );
		} );

		it( 'includes the cause when present', () => {
			const err = new Error( 'outer', { cause: new Error( 'inner cause' ) } );

			const result = formatFatalError( err );

			expect( result ).toContain( 'inner cause' );
		} );
	} );

	describe( 'uncaughtError', () => {
		let withErrorSpy;

		beforeEach( () => {
			withErrorSpy = jest.spyOn( exit, 'withError' ).mockImplementation( () => {
				throw new Error( 'exit.withError called' );
			} );
		} );

		it( 'ignores EPIPE errors from closed streams', () => {
			const err = Object.assign( new Error( 'write EPIPE' ), { code: 'EPIPE' } );

			expect( () => uncaughtError( err ) ).not.toThrow();
			expect( withErrorSpy ).not.toHaveBeenCalled();
		} );

		it( 'exits with a UserError without asking the user to contact support', () => {
			const err = new UserError( 'Update canceled' );

			expect( () => uncaughtError( err ) ).toThrow( 'exit.withError called' );
			expect( withErrorSpy ).toHaveBeenCalledWith( err );
			expect( console.log ).not.toHaveBeenCalled();
		} );

		it( 'ends with the message of an Error', () => {
			expect( () => uncaughtError( new Error( 'boom' ) ) ).toThrow( 'exit.withError called' );
			expect( withErrorSpy ).toHaveBeenCalledWith( 'Unexpected error: boom' );
		} );

		it.each( [ 'message', 'stack', 'cause', 'code' ] )(
			'still exits when %s has a throwing getter',
			key => {
				const err = new Error( 'outer' );
				Object.defineProperty( err, key, {
					get() {
						throw new Error( 'getter failed' );
					},
				} );

				expect( () => uncaughtError( err ) ).toThrow( 'exit.withError called' );
				expect( withErrorSpy ).toHaveBeenCalledTimes( 1 );
				expect( console.log ).toHaveBeenCalledWith(
					expect.stringContaining( 'DEBUG=@automattic/vip:*' )
				);
			}
		);

		it( 'still reports the outer error when a nested Error has a throwing message getter', () => {
			const cause = new Error( 'inner' );
			Object.defineProperty( cause, 'message', {
				get() {
					throw new Error( 'getter failed' );
				},
			} );
			const err = new Error( 'outer', { cause } );

			expect( () => uncaughtError( err ) ).toThrow( 'exit.withError called' );
			expect( withErrorSpy ).toHaveBeenCalledWith( 'Unexpected error: outer' );
			expect( console.log ).toHaveBeenCalledWith(
				expect.stringContaining( 'DEBUG=@automattic/vip:*' )
			);
		} );

		it( 'uses a placeholder if diagnostic properties cannot be read', () => {
			const value = new Proxy(
				{},
				{
					ownKeys() {
						throw new Error( 'unreadable object' );
					},
				}
			);

			expect( () => uncaughtError( value ) ).toThrow( 'exit.withError called' );
			expect( withErrorSpy ).toHaveBeenCalledWith( 'Unexpected error: [Uninspectable value]' );
		} );

		it( 'redacts credentials from string rejections', () => {
			expect( () => uncaughtError( 'https://url-user:url-password@example.test/' ) ).toThrow(
				'exit.withError called'
			);
			expect( withErrorSpy ).toHaveBeenCalledWith(
				'Unexpected error: https://[REDACTED]@example.test/'
			);
			expect( console.log.mock.calls.flat().join( '\n' ) ).not.toContain( 'url-password' );
		} );

		it.each( [ 'an Error', 'a plain object' ] )(
			'redacts nested secrets from %s and the final summary',
			kind => {
				const details = {
					password: 'password-value',
					cause: { headers: { Authorization: 'Bearer auth-value' }, privateKey: 'key-value' },
					url: 'https://url-user:url-password@example.test/?token=query-value',
				};
				const value =
					kind === 'an Error' ? Object.assign( new Error( details.url ), details ) : details;
				const customInspector = jest.fn( () => 'custom-secret' );
				value[ util.inspect.custom ] = customInspector;

				expect( () => uncaughtError( value ) ).toThrow( 'exit.withError called' );
				expect( customInspector ).not.toHaveBeenCalled();
				const output = [ ...console.log.mock.calls.flat(), ...withErrorSpy.mock.calls.flat() ].join(
					'\n'
				);
				expect( output ).toContain( '[REDACTED]' );
				for ( const secret of [
					'password-value',
					'auth-value',
					'key-value',
					'url-user',
					'url-password',
					'query-value',
					'custom-secret',
				] ) {
					expect( output ).not.toContain( secret );
				}
			}
		);

		it.each( [ false, true ] )(
			'preserves hidden rejection details with a throwing inspector: %s',
			throwing => {
				const value = Object.defineProperty( {}, 'detail', { value: 'diagnostic details' } );
				if ( throwing ) {
					value[ util.inspect.custom ] = () => {
						throw new Error( 'inspection failed' );
					};
				}

				expect( () => uncaughtError( value ) ).toThrow( 'exit.withError called' );
				expect( withErrorSpy ).toHaveBeenCalledWith(
					expect.stringContaining( 'diagnostic details' )
				);
				expect( console.log ).toHaveBeenCalledWith(
					expect.stringContaining( 'DEBUG=@automattic/vip:*' )
				);
			}
		);

		it.each( [
			[ 'undefined', undefined, 'Unexpected error: undefined' ],
			[ 'a string', 'just a string', 'Unexpected error: just a string' ],
			[ 'a plain object', { code: 'ECONNRESET' }, "Unexpected error: { code: 'ECONNRESET' }" ],
			[
				'an object without a prototype',
				Object.assign( Object.create( null ), { code: 'ECONNRESET' } ),
				"Unexpected error: [Object: null prototype] { code: 'ECONNRESET' }",
			],
		] )( 'handles a rejection with %s', ( _label, value, expected ) => {
			expect( () => uncaughtError( value ) ).toThrow( 'exit.withError called' );
			expect( withErrorSpy ).toHaveBeenCalledTimes( 1 );
			expect( withErrorSpy ).toHaveBeenCalledWith( expected );
		} );
	} );
} );
