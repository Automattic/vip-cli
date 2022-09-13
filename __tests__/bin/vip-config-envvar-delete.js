/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { deleteEnvVarCommand } from 'bin/vip-config-envvar-delete';
import command from 'lib/cli/command';
import { deleteEnvVar, validateNameWithMessage } from 'lib/envvar/api';
import { cancel, confirm, promptForValue } from 'lib/envvar/input';
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
		option: () => commandMock,
	};

	return jest.fn( () => commandMock );
} );

jest.mock( 'lib/cli/format', () => ( {
	formatData: jest.fn(),
} ) );

jest.mock( 'lib/envvar/api', () => ( {
	deleteEnvVar: jest.fn( () => Promise.resolve() ),
	validateNameWithMessage: jest.fn( () => true ),
} ) );

jest.mock( 'lib/envvar/input', () => ( {
	cancel: jest.fn( mockExit ),
	confirm: jest.fn( () => Promise.resolve( true ) ),
	promptForValue: jest.fn(),
} ) );

jest.mock( 'lib/envvar/logging', () => ( {
	debug: jest.fn(),
	getEnvContext: () => 'test',
} ) );

jest.mock( 'lib/tracker', () => ( {
	trackEvent: jest.fn(),
} ) );

describe( 'vip config envvar delete', () => {
	it( 'registers as a command', () => {
		expect( command ).toHaveBeenCalled();
	} );
} );

describe( 'deleteEnvVarCommand', () => {
	let args, opts;
	const eventPayload = expect.objectContaining( { command: expect.stringContaining( 'vip @mysite.develop config envvar delete' ) } );
	const executeEvent = [ 'envvar_delete_command_execute', eventPayload ];
	const successEvent = [ 'envvar_delete_command_success', eventPayload ];

	function setFixtures( name, skipConfirmation = '' ) {
		args = [ name ];
		opts = {
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
			skipConfirmation,
		};
	}

	beforeEach( () => {
		jest.clearAllMocks();

		// Restore mock implementations we override in tests.
		confirm.mockImplementation( () => true );
		validateNameWithMessage.mockImplementation( () => true );
	} );

	it( 'validates the name, prompts for confirmation, deletes the variable, and prints success', async () => {
		const name = 'TEST_VARIABLE';

		setFixtures( name );
		promptForValue.mockImplementation( () => Promise.resolve( name ) );

		await deleteEnvVarCommand( args, opts );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( promptForValue ).toHaveBeenCalled();
		expect( confirm ).toHaveBeenCalled();
		expect( deleteEnvVar ).toHaveBeenCalledWith( 1, 3, name );
		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'Successfully deleted environment variable' ) );
		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, successEvent ] );
		expect( rollbar.error ).not.toHaveBeenCalled();
	} );

	it( 'skips confirmation when --skip-confirmation is set', async () => {
		const name = 'TEST_VARIABLE';
		const skipConfirmation = 'yes';

		setFixtures( name, skipConfirmation );
		promptForValue.mockImplementation( () => Promise.resolve( name ) );

		await deleteEnvVarCommand( args, opts );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( promptForValue ).not.toHaveBeenCalled();
		expect( confirm ).not.toHaveBeenCalled();
		expect( deleteEnvVar ).toHaveBeenCalledWith( 1, 3, name );
		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'Successfully deleted environment variable' ) );
		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, successEvent ] );
		expect( rollbar.error ).not.toHaveBeenCalled();
	} );

	it( 'cancels when user does not confirm', async () => {
		const name = 'TEST_VARIABLE';
		const cancelEvent = [ 'envvar_delete_user_cancelled_confirmation', eventPayload ];

		setFixtures( name );
		promptForValue.mockImplementation( () => Promise.resolve( name ) );
		confirm.mockImplementation( () => Promise.resolve( false ) );

		await expect( () => deleteEnvVarCommand( args, opts ) ).rejects.toEqual( 'EXIT' );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( promptForValue ).toHaveBeenCalled();
		expect( confirm ).toHaveBeenCalled();
		expect( cancel ).toHaveBeenCalled();
		expect( deleteEnvVar ).not.toHaveBeenCalled();
		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, cancelEvent ] );
		expect( rollbar.error ).not.toHaveBeenCalled();
	} );

	it( 'rejects an invalid name and exits', async () => {
		const name = 'INVALID**VARIABLE';
		const errorEvent = [ 'envvar_delete_invalid_name', eventPayload ];

		setFixtures( name );
		validateNameWithMessage.mockImplementation( () => false );

		await expect( () => deleteEnvVarCommand( args, opts ) ).rejects.toEqual( 'EXIT' );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( process.exit ).toHaveBeenCalledWith( 1 );

		expect( promptForValue ).not.toHaveBeenCalled();
		expect( confirm ).not.toHaveBeenCalled();
		expect( deleteEnvVar ).not.toHaveBeenCalled();
		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, errorEvent ] );
		expect( rollbar.error ).not.toHaveBeenCalled();
	} );

	it( 'rethrows error thrown from deleteEnvVar', async () => {
		const name = 'TEST_VARIABLE';
		const thrownError = new Error( 'fetch error' );
		const errorEvent = [ 'envvar_delete_mutation_error', eventPayload ];

		setFixtures( name );
		promptForValue.mockImplementation( () => Promise.resolve( name ) );
		deleteEnvVar.mockImplementation( () => Promise.reject( thrownError ) );

		await expect( () => deleteEnvVarCommand( args, opts ) ).rejects.toEqual( thrownError );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( promptForValue ).toHaveBeenCalled();
		expect( confirm ).toHaveBeenCalled();
		expect( deleteEnvVar ).toHaveBeenCalledWith( 1, 3, name );
		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, errorEvent ] );
		expect( rollbar.error ).toHaveBeenCalledWith( thrownError );
	} );
} );
