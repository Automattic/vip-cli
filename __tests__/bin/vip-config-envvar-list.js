/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { listEnvVarsCommand } from 'bin/vip-config-envvar-list';
import command from 'lib/cli/command';
import { formatData } from 'lib/cli/format';
import { listEnvVars } from 'lib/envvar/api';
import { rollbar } from 'lib/rollbar';
import { trackEvent } from 'lib/tracker';

function mockExit() {
	throw 'EXIT'; // can't actually exit the test
}

jest.spyOn( console, 'log' ).mockImplementation( () => {} );
jest.spyOn( rollbar, 'error' ).mockImplementation( () => {} );
jest.spyOn( process, 'exit' ).mockImplementation( mockExit );

jest.mock( 'lib/cli/command', () => {
	const commandMock = {
		argv: () => commandMock,
		examples: () => commandMock,
	};

	return jest.fn( () => commandMock );
} );

jest.mock( 'lib/cli/format', () => ( {
	formatData: jest.fn(),
} ) );

jest.mock( 'lib/envvar/api', () => ( {
	listEnvVars: jest.fn(),
} ) );

jest.mock( 'lib/envvar/logging', () => ( {
	debug: jest.fn(),
	getEnvContext: () => 'test',
} ) );

jest.mock( 'lib/tracker', () => ( {
	trackEvent: jest.fn(),
} ) );

describe( 'vip config envvar list', () => {
	it( 'registers as a command', () => {
		expect( command ).toHaveBeenCalled();
	} );
} );

describe( 'listEnvVarsCommand', () => {
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
	const eventPayload = expect.objectContaining( { command: 'vip config envvar list' } );
	const executeEvent = [ 'envvar_list_command_execute', eventPayload ];
	const successEvent = [ 'envvar_list_command_success', eventPayload ];

	beforeEach( () => {
		jest.clearAllMocks();
	} );

	it( 'returns env vars from listEnvVars with correct format', async () => {
		const returnedEnvVars = [ 'hello' ];
		listEnvVars.mockImplementation( () => Promise.resolve( returnedEnvVars ) );

		await listEnvVarsCommand( args, opts );

		expect( formatData ).toHaveBeenCalledWith( [ { name: 'hello' } ], 'csv' );
		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, successEvent ] );
		expect( rollbar.error ).not.toHaveBeenCalled();
	} );

	it( 'exits with message when there are no env vars', async () => {
		listEnvVars.mockImplementation( () => Promise.resolve( [] ) );

		await expect( () => listEnvVarsCommand( args, opts ) ).rejects.toEqual( 'EXIT' );

		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'There are no environment variables' ) );
		expect( process.exit ).toHaveBeenCalled();
		expect( formatData ).not.toHaveBeenCalled();
		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, successEvent ] );
		expect( rollbar.error ).not.toHaveBeenCalled();
	} );

	it( 'rethrows error thrown from listEnvVars', async () => {
		const thrownError = new Error( 'fetch error' );
		const queryErrorEvent = [ 'envvar_list_query_error', eventPayload ];
		listEnvVars.mockImplementation( () => Promise.reject( thrownError ) );

		await expect( () => listEnvVarsCommand( args, opts ) ).rejects.toEqual( thrownError );

		expect( formatData ).not.toHaveBeenCalled();
		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, queryErrorEvent ] );
		expect( rollbar.error ).toHaveBeenCalledWith( thrownError );
	} );
} );
