/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { getAllEnvVarsCommand } from '../../src/bin/vip-config-envvar-get-all';
import command from '../../src/lib/cli/command';
import { formatData } from '../../src/lib/cli/format';
import { getEnvVars } from '../../src/lib/envvar/api';
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

jest.mock( '../../src/lib/cli/format', () => ( {
	formatData: jest.fn(),
} ) );

jest.mock( '../../src/lib/envvar/api', () => ( {
	getEnvVars: jest.fn(),
} ) );

jest.mock( '../../src/lib/envvar/logging', () => ( {
	debug: jest.fn(),
	getEnvContext: () => 'test',
} ) );

jest.mock( '../../src/lib/tracker', () => ( {
	trackEvent: jest.fn(),
} ) );

describe( 'vip config envvar get-all', () => {
	it( 'registers as a command', () => {
		expect( command ).toHaveBeenCalled();
	} );
} );

describe( 'getAllEnvVarsCommand', () => {
	const args = [];
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
		format: 'csv',
	};
	const eventPayload = expect.objectContaining( {
		command: 'vip @mysite.develop config envvar get-all',
	} );
	const executeEvent = [ 'envvar_get_all_command_execute', eventPayload ];
	const successEvent = [ 'envvar_get_all_command_success', eventPayload ];

	beforeEach( () => {
		jest.clearAllMocks();
	} );

	it( 'returns env vars from getEnvVars with correct format', async () => {
		const returnedEnvVars = [ { name: 'HELLO', value: 'bananas' } ];
		getEnvVars.mockImplementation( () => Promise.resolve( returnedEnvVars ) );

		await getAllEnvVarsCommand( args, opts );

		expect( formatData ).toHaveBeenCalledWith( returnedEnvVars, 'csv' );
		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, successEvent ] );
	} );

	it( 'exits with message when there are no env vars', async () => {
		getEnvVars.mockImplementation( () => Promise.resolve( [] ) );

		await expect( () => getAllEnvVarsCommand( args, opts ) ).rejects.toEqual( 'EXIT' );

		expect( console.log ).toHaveBeenCalledWith(
			expect.stringContaining( 'There are no environment variables' )
		);
		expect( process.exit ).toHaveBeenCalled();
		expect( formatData ).not.toHaveBeenCalled();
		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, successEvent ] );
	} );

	it( 'rethrows error thrown from getEnvVars', async () => {
		const thrownError = new Error( 'fetch error' );
		const queryErrorEvent = [ 'envvar_get_all_query_error', eventPayload ];
		getEnvVars.mockImplementation( () => Promise.reject( thrownError ) );

		await expect( () => getAllEnvVarsCommand( args, opts ) ).rejects.toEqual( thrownError );

		expect( formatData ).not.toHaveBeenCalled();
		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, queryErrorEvent ] );
	} );
} );
