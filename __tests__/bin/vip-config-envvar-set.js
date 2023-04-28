// @flow

/**
 * External dependencies
 */
import { describe, expect, it, jest } from '@jest/globals';
import type { Response } from 'node-fetch';

/**
 * Internal dependencies
 */
import { setEnvVarCommand } from '../../src/bin/vip-config-envvar-set';
import command from '../../src/lib/cli/command';
import { setEnvVar, validateNameWithMessage } from '../../src/lib/envvar/api';
import { cancel, confirm, promptForValue } from '../../src/lib/envvar/input';
import { readVariableFromFile } from '../../src/lib/envvar/read-file';
import { rollbar } from '../../src/lib/rollbar';
import { trackEvent } from '../../src/lib/tracker';

function mockExit() {
	throw 'EXIT'; // can't actually exit the test
}

jest.spyOn( console, 'log' ).mockImplementation( () => {} );
jest.spyOn( rollbar, 'error' ).mockImplementation( () => {} );
jest.spyOn( process, 'exit' ).mockImplementation( mockExit );

interface CommandMockType {
	argv: () => CommandMockType;
	examples: () => CommandMockType;
	option: () => CommandMockType;
}

jest.mock( 'lib/cli/command', () => {
	const commandMock: CommandMockType = {
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

const mockConfirm: JestMockFn<[string], Promise<boolean>> = confirm;
const mockValidateNameWithMessage: JestMockFn<[string], boolean> = validateNameWithMessage;
const mockPromptForValue: JestMockFn<[string, string], Promise<string>> = promptForValue;
const mockSetEnvVar: JestMockFn<[number, number, string, string], Promise<void>> = setEnvVar;
const mockTrackEvent: JestMockFn<[], Promise<Response>> = trackEvent;
const mockReadVariableFromFile: JestMockFn<[any], Promise<string>> = readVariableFromFile;

describe( 'vip config envvar set', () => {
	it( 'registers as a command', () => {
		expect( command ).toHaveBeenCalled();
	} );
} );

describe( 'setEnvVarCommand', () => {
	let args;
	let opts;
	const eventPayload = expect.objectContaining( { command: expect.stringContaining( 'vip @mysite.develop config envvar set' ) } );
	const executeEvent = [ 'envvar_set_command_execute', eventPayload ];
	const successEvent = [ 'envvar_set_command_success', eventPayload ];

	function setFixtures( name: string, fromFile: string = '', skipConfirmation: string = '' ) {
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
		mockConfirm.mockImplementation( () => Promise.resolve( true ) );
		mockValidateNameWithMessage.mockImplementation( () => true );
	} );

	it( 'validates the name, prompts for confirmation, sets the variable, and prints success', async () => {
		const name = 'TEST_VARIABLE';
		// $FlowIgnore[method-unbinding] No idea how to fix this
		const value = 'test value';

		setFixtures( name );
		mockPromptForValue.mockImplementation( () => Promise.resolve( value ) );

		await setEnvVarCommand( args, opts );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( promptForValue ).toHaveBeenCalled();
		expect( readVariableFromFile ).not.toHaveBeenCalled();
		expect( confirm ).toHaveBeenCalled();
		expect( setEnvVar ).toHaveBeenCalledWith( 1, 3, name, value );
		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'Successfully set environment variable' ) );
		expect( mockTrackEvent.mock.calls ).toEqual( [ executeEvent, successEvent ] );
		expect( rollbar.error ).not.toHaveBeenCalled();
	} );

	it( 'reads variable from file when --from-file is set', async () => {
		const name = 'TEST_VARIABLE';
		const value = 'test value from file';
		const fromFile = '/some/path';

		setFixtures( name, fromFile );
		mockReadVariableFromFile.mockImplementation( () => Promise.resolve( value ) );

		await setEnvVarCommand( args, opts );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( readVariableFromFile ).toHaveBeenCalledWith( fromFile );
		expect( promptForValue ).not.toHaveBeenCalled();
		expect( confirm ).toHaveBeenCalled();
		expect( setEnvVar ).toHaveBeenCalledWith( 1, 3, name, value );
		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'Successfully set environment variable' ) );
		expect( mockTrackEvent.mock.calls ).toEqual( [ executeEvent, successEvent ] );
		expect( rollbar.error ).not.toHaveBeenCalled();
	} );

	it( 'skips confirmation when --skip-confirmation is set', async () => {
		const name = 'TEST_VARIABLE';
		const value = 'test value with no confirmation';
		const skipConfirmation = 'yes';

		setFixtures( name, '', skipConfirmation );
		mockPromptForValue.mockImplementation( () => Promise.resolve( value ) );

		await setEnvVarCommand( args, opts );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( promptForValue ).toHaveBeenCalled();
		expect( readVariableFromFile ).not.toHaveBeenCalled();
		expect( confirm ).not.toHaveBeenCalled();
		expect( setEnvVar ).toHaveBeenCalledWith( 1, 3, name, value );
		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'Successfully set environment variable' ) );
		expect( mockTrackEvent.mock.calls ).toEqual( [ executeEvent, successEvent ] );
		expect( rollbar.error ).not.toHaveBeenCalled();
	} );

	it( 'cancels when user does not confirm', async () => {
		const name = 'TEST_VARIABLE';
		const value = 'any value';
		const cancelEvent = [ 'envvar_set_user_cancelled_confirmation', eventPayload ];

		setFixtures( name );
		mockPromptForValue.mockImplementation( () => Promise.resolve( value ) );
		mockConfirm.mockImplementation( () => Promise.resolve( false ) );

		await expect( () => setEnvVarCommand( args, opts ) ).rejects.toEqual( 'EXIT' );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( promptForValue ).toHaveBeenCalled();
		expect( confirm ).toHaveBeenCalled();
		expect( cancel ).toHaveBeenCalled();
		expect( setEnvVar ).not.toHaveBeenCalled();
		expect( mockTrackEvent.mock.calls ).toEqual( [ executeEvent, cancelEvent ] );
		expect( rollbar.error ).not.toHaveBeenCalled();
	} );

	it( 'rejects an invalid name and exits', async () => {
		const name = 'INVALID**VARIABLE';
		const errorEvent = [ 'envvar_set_invalid_name', eventPayload ];

		setFixtures( name );
		mockValidateNameWithMessage.mockImplementation( () => false );

		await expect( () => setEnvVarCommand( args, opts ) ).rejects.toEqual( 'EXIT' );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		// $FlowIgnore[method-unbinding] No idea how to fix this
		expect( process.exit ).toHaveBeenCalledWith( 1 );

		expect( promptForValue ).not.toHaveBeenCalled();
		expect( readVariableFromFile ).not.toHaveBeenCalled();
		expect( confirm ).not.toHaveBeenCalled();
		expect( setEnvVar ).not.toHaveBeenCalled();
		expect( mockTrackEvent.mock.calls ).toEqual( [ executeEvent, errorEvent ] );
		expect( rollbar.error ).not.toHaveBeenCalled();
	} );

	it( 'rethrows error thrown from setEnvVar', async () => {
		const name = 'TEST_VARIABLE';
		const value = 'some value';
		const thrownError = new Error( 'fetch error' );
		const errorEvent = [ 'envvar_set_mutation_error', eventPayload ];

		setFixtures( name );
		mockPromptForValue.mockImplementation( () => Promise.resolve( value ) );
		mockSetEnvVar.mockImplementation( () => Promise.reject<void>( thrownError ) );

		await expect( () => setEnvVarCommand( args, opts ) ).rejects.toEqual( thrownError );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( promptForValue ).toHaveBeenCalled();
		expect( confirm ).toHaveBeenCalled();
		expect( setEnvVar ).toHaveBeenCalledWith( 1, 3, name, value );
		expect( mockTrackEvent.mock.calls ).toEqual( [ executeEvent, errorEvent ] );
		expect( rollbar.error ).toHaveBeenCalledWith( thrownError );
	} );
} );
