/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { setEnvVarCommand } from 'bin/vip-config-envvar-set';
import command from 'lib/cli/command';
import { setEnvVar, validateNameWithMessage } from 'lib/envvar/api';
import { cancel, confirm, promptForValue } from 'lib/envvar/input';
import { readVariableFromFile } from 'lib/envvar/read-file';
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
	setEnvVar: jest.fn( () => Promise.resolve() ),
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

jest.mock( 'lib/envvar/read-file', () => ( {
	readVariableFromFile: jest.fn(),
} ) );

jest.mock( 'lib/tracker', () => ( {
	trackEvent: jest.fn(),
} ) );

describe( 'vip config envvar set', () => {
	it( 'registers as a command', () => {
		expect( command ).toHaveBeenCalled();
	} );
} );

describe( 'setEnvVarCommand', () => {
	let args, opts;
	const eventPayload = expect.objectContaining( { command: expect.stringContaining( 'vip config envvar set' ) } );
	const executeEvent = [ 'envvar_set_command_execute', eventPayload ];
	const successEvent = [ 'envvar_set_command_success', eventPayload ];

	function setFixtures( name: string, fromFile = '', skipConfirmation = '' ) {
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
			fromFile,
			skipConfirmation,
		};
	}

	beforeEach( () => {
		jest.clearAllMocks();

		// Restore mock implementations we override in tests.
		confirm.mockImplementation( () => true );
		validateNameWithMessage.mockImplementation( () => true );
	} );

	it( 'validates the name, prompts for confirmation, sets the variable, and prints success', async () => {
		const name = 'TEST_VARIABLE';
		const value = 'test value';

		setFixtures( name );
		promptForValue.mockImplementation( () => Promise.resolve( value ) );

		await setEnvVarCommand( args, opts );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( promptForValue ).toHaveBeenCalled();
		expect( readVariableFromFile ).not.toHaveBeenCalled();
		expect( confirm ).toHaveBeenCalled();
		expect( setEnvVar ).toHaveBeenCalledWith( 1, 3, name, value );
		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'Successfully set environment variable' ) );
		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, successEvent ] );
		expect( rollbar.error ).not.toHaveBeenCalled();
	} );

	it( 'reads variable from file when --from-file is set', async () => {
		const name = 'TEST_VARIABLE';
		const value = 'test value from file';
		const fromFile = '/some/path';

		setFixtures( name, fromFile );
		readVariableFromFile.mockImplementation( () => Promise.resolve( value ) );

		await setEnvVarCommand( args, opts );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( readVariableFromFile ).toHaveBeenCalledWith( fromFile );
		expect( promptForValue ).not.toHaveBeenCalled();
		expect( confirm ).toHaveBeenCalled();
		expect( setEnvVar ).toHaveBeenCalledWith( 1, 3, name, value );
		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'Successfully set environment variable' ) );
		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, successEvent ] );
		expect( rollbar.error ).not.toHaveBeenCalled();
	} );

	it( 'skips confirmation when --skip-confirmation is set', async () => {
		const name = 'TEST_VARIABLE';
		const value = 'test value with no confirmation';
		const skipConfirmation = 'yes';

		setFixtures( name, '', skipConfirmation );
		promptForValue.mockImplementation( () => Promise.resolve( value ) );

		await setEnvVarCommand( args, opts );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( promptForValue ).toHaveBeenCalled();
		expect( readVariableFromFile ).not.toHaveBeenCalled();
		expect( confirm ).not.toHaveBeenCalled();
		expect( setEnvVar ).toHaveBeenCalledWith( 1, 3, name, value );
		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'Successfully set environment variable' ) );
		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, successEvent ] );
		expect( rollbar.error ).not.toHaveBeenCalled();
	} );

	it( 'cancels when user does not confirm', async () => {
		const name = 'TEST_VARIABLE';
		const value = 'any value';
		const cancelEvent = [ 'envvar_set_user_cancelled_confirmation', eventPayload ];

		setFixtures( name );
		promptForValue.mockImplementation( () => Promise.resolve( value ) );
		confirm.mockImplementation( () => Promise.resolve( false ) );

		await expect( () => setEnvVarCommand( args, opts ) ).rejects.toEqual( 'EXIT' );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( promptForValue ).toHaveBeenCalled();
		expect( confirm ).toHaveBeenCalled();
		expect( cancel ).toHaveBeenCalled();
		expect( setEnvVar ).not.toHaveBeenCalled();
		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, cancelEvent ] );
		expect( rollbar.error ).not.toHaveBeenCalled();
	} );

	it( 'rejects an invalid name and exits', async () => {
		const name = 'INVALID**VARIABLE';
		const errorEvent = [ 'envvar_set_invalid_name', eventPayload ];

		setFixtures( name );
		validateNameWithMessage.mockImplementation( () => false );

		await expect( () => setEnvVarCommand( args, opts ) ).rejects.toEqual( 'EXIT' );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( process.exit ).toHaveBeenCalledWith( 1 );

		expect( promptForValue ).not.toHaveBeenCalled();
		expect( readVariableFromFile ).not.toHaveBeenCalled();
		expect( confirm ).not.toHaveBeenCalled();
		expect( setEnvVar ).not.toHaveBeenCalled();
		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, errorEvent ] );
		expect( rollbar.error ).not.toHaveBeenCalled();
	} );

	it( 'rethrows error thrown from setEnvVar', async () => {
		const name = 'TEST_VARIABLE';
		const value = 'some value';
		const thrownError = new Error( 'fetch error' );
		const errorEvent = [ 'envvar_set_mutation_error', eventPayload ];

		setFixtures( name );
		promptForValue.mockImplementation( () => Promise.resolve( value ) );
		setEnvVar.mockImplementation( () => Promise.reject( thrownError ) );

		await expect( () => setEnvVarCommand( args, opts ) ).rejects.toEqual( thrownError );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( promptForValue ).toHaveBeenCalled();
		expect( confirm ).toHaveBeenCalled();
		expect( setEnvVar ).toHaveBeenCalledWith( 1, 3, name, value );
		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, errorEvent ] );
		expect( rollbar.error ).toHaveBeenCalledWith( thrownError );
	} );
} );
