/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { getEnvVarCommand } from '../../src/bin/vip-config-envvar-get';
import command from '../../src/lib/cli/command';
import { getEnvVar } from '../../src/lib/envvar/api';
import { trackEvent } from '../../src/lib/tracker';

function mockExit() {
	throw 'EXIT'; // can't actually exit the test
}

jest.spyOn( console, 'log' ).mockImplementation( () => {} );
jest.spyOn( process, 'exit' ).mockImplementation( mockExit );

jest.mock( '../../src/lib/cli/command', () => {
	const commandMock = {
		argv: () => commandMock,
		examples: () => commandMock,
	};

	return jest.fn( () => commandMock );
} );

jest.mock( '../../src/lib/envvar/api', () => ( {
	getEnvVar: jest.fn(),
} ) );

jest.mock( '../../src/lib/envvar/logging', () => ( {
	debug: jest.fn(),
	getEnvContext: () => 'test',
} ) );

jest.mock( '../../src/lib/tracker', () => ( {
	trackEvent: jest.fn(),
} ) );

describe( 'vip config envvar get', () => {
	it( 'registers as a command', () => {
		expect( command ).toHaveBeenCalled();
	} );
} );

describe( 'getEnvVarCommand', () => {
	const args = [ 'HELLO' ];
	const opts = {
		app: {
			id: 1,
			organization: {
				id: 2,
			},
		},
		env: {
			id: 3,
			type: 'develop',
		},
	};
	const eventPayload = expect.objectContaining( {
		command: 'vip @mysite.develop config envvar get HELLO',
	} );
	const executeEvent = [ 'envvar_get_command_execute', eventPayload ];
	const successEvent = [ 'envvar_get_command_success', eventPayload ];

	beforeEach( () => {
		jest.clearAllMocks();
	} );

	it( 'returns an env var from getEnvVar with correct format', async () => {
		const returnedEnvVar = { name: 'HELLO', value: 'banana' };
		getEnvVar.mockImplementation( () => Promise.resolve( returnedEnvVar ) );

		await getEnvVarCommand( args, opts );

		expect( console.log ).toHaveBeenCalledWith( 'banana' );
		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, successEvent ] );
	} );

	it( 'exits with message when the env var doesn’t exist', async () => {
		getEnvVar.mockImplementation( () => Promise.resolve( null ) );

		await expect( () => getEnvVarCommand( args, opts ) ).rejects.toEqual( 'EXIT' );

		expect( console.log ).toHaveBeenCalledWith(
			expect.stringContaining( 'The environment variable "HELLO" does not exist' )
		);
		expect( process.exit ).toHaveBeenCalled();
		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, successEvent ] );
	} );

	it( 'rethrows error thrown from getEnvVar', async () => {
		const thrownError = new Error( 'fetch error' );
		const queryErrorEvent = [ 'envvar_get_query_error', eventPayload ];
		getEnvVar.mockImplementation( () => Promise.reject( thrownError ) );

		await expect( () => getEnvVarCommand( args, opts ) ).rejects.toEqual( thrownError );

		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, queryErrorEvent ] );
	} );
} );
