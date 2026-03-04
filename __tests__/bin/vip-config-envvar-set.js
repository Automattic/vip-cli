import { describe, expect, it, jest } from '@jest/globals';

import { setEnvVarCommand } from '../../src/bin/vip-config-envvar-set';
import command from '../../src/lib/cli/command';
import { setEnvVar, validateNameWithMessage } from '../../src/lib/envvar/api';
import {
	cancel,
	confirm,
	promptForReloadManifest,
	promptForValue,
	showDeployWarning,
} from '../../src/lib/envvar/input';
import { readVariableFromFile } from '../../src/lib/envvar/read-file';
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
		option: () => commandMock,
	};

	return jest.fn( () => commandMock );
} );

jest.mock( '../../src/lib/cli/format', () => ( {
	formatData: jest.fn(),
} ) );

jest.mock( '../../src/lib/envvar/api', () => ( {
	setEnvVar: jest.fn( () => Promise.resolve() ),
	validateNameWithMessage: jest.fn( () => true ),
} ) );

jest.mock( '../../src/lib/envvar/input', () => ( {
	cancel: jest.fn( mockExit ),
	confirm: jest.fn( () => Promise.resolve( true ) ),
	promptForReloadManifest: jest.fn( () => Promise.resolve( true ) ),
	promptForValue: jest.fn(),
	showDeployWarning: jest.fn(),
} ) );

jest.mock( '../../src/lib/envvar/logging', () => ( {
	debug: jest.fn(),
	getEnvContext: () => 'test',
} ) );

jest.mock( '../../src/lib/envvar/read-file', () => ( {
	readVariableFromFile: jest.fn(),
} ) );

jest.mock( '../../src/lib/tracker', () => ( {
	trackEvent: jest.fn(),
} ) );

const mockConfirm = confirm;
const mockValidateNameWithMessage = validateNameWithMessage;
const mockPromptForValue = promptForValue;
const mockPromptForReloadManifest = promptForReloadManifest;
const mockSetEnvVar = setEnvVar;
const mockTrackEvent = trackEvent;
const mockReadVariableFromFile = readVariableFromFile;
const mockShowDeployWarning = showDeployWarning;

describe( 'vip config envvar set', () => {
	it( 'registers as a command', () => {
		expect( command ).toHaveBeenCalled();
	} );
} );

describe( 'setEnvVarCommand', () => {
	let args;
	let opts;
	const eventPayload = expect.objectContaining( {
		command: expect.stringContaining( 'vip config envvar set' ),
	} );
	const executeEvent = [ 'envvar_set_command_execute', eventPayload ];
	const successEvent = [ 'envvar_set_command_success', eventPayload ];

	/**
	 * @param {string} name
	 * @param {string} fromFile
	 * @param {string} skipConfirmation
	 * @param {number} typeId
	 */
	function setFixtures( name, fromFile = '', skipConfirmation = '', typeId = 1 ) {
		args = [ name ];
		opts = {
			app: {
				id: 1,
				typeId,
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
		mockPromptForReloadManifest.mockImplementation( () => Promise.resolve( true ) );
		mockSetEnvVar.mockImplementation( () => Promise.resolve() );
		mockShowDeployWarning.mockImplementation( () => {} );
	} );

	it( 'validates the name, prompts for confirmation, sets the variable, and prints success', async () => {
		const name = 'TEST_VARIABLE';
		const value = 'test value';

		setFixtures( name );
		mockPromptForValue.mockImplementation( () => Promise.resolve( value ) );
		mockConfirm.mockImplementation( () => Promise.resolve( true ) );
		mockPromptForReloadManifest.mockImplementation( () => Promise.resolve( true ) );

		await setEnvVarCommand( args, opts );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( promptForValue ).toHaveBeenCalled();
		expect( readVariableFromFile ).not.toHaveBeenCalled();
		expect( confirm ).toHaveBeenCalledTimes( 1 ); // Value confirmation only
		expect( promptForReloadManifest ).toHaveBeenCalledWith( 1 );
		expect( setEnvVar ).toHaveBeenCalledWith( 1, 3, name, value, true );
		expect( console.log ).toHaveBeenCalledWith(
			expect.stringContaining( 'Successfully set environment variable' )
		);
		expect( mockShowDeployWarning ).not.toHaveBeenCalled();
		expect( mockTrackEvent.mock.calls ).toEqual( [ executeEvent, successEvent ] );
	} );

	it( 'reads variable from file when --from-file is set', async () => {
		const name = 'TEST_VARIABLE';
		const value = 'test value from file';
		const fromFile = '/some/path';

		setFixtures( name, fromFile );
		mockReadVariableFromFile.mockImplementation( () => Promise.resolve( value ) );
		mockConfirm.mockImplementation( () => Promise.resolve( true ) );
		mockPromptForReloadManifest.mockImplementation( () => Promise.resolve( true ) );

		await setEnvVarCommand( args, opts );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( readVariableFromFile ).toHaveBeenCalledWith( fromFile );
		expect( promptForValue ).not.toHaveBeenCalled();
		expect( confirm ).toHaveBeenCalledTimes( 1 ); // Value confirmation only
		expect( promptForReloadManifest ).toHaveBeenCalledWith( 1 );
		expect( setEnvVar ).toHaveBeenCalledWith( 1, 3, name, value, true );
		expect( console.log ).toHaveBeenCalledWith(
			expect.stringContaining( 'Successfully set environment variable' )
		);
		expect( mockShowDeployWarning ).not.toHaveBeenCalled();
		expect( mockTrackEvent.mock.calls ).toEqual( [ executeEvent, successEvent ] );
	} );

	it( 'skips confirmation when --skip-confirmation is set', async () => {
		const name = 'TEST_VARIABLE';
		const value = 'test value with no confirmation';
		const skipConfirmation = 'yes';

		setFixtures( name, '', skipConfirmation );
		mockPromptForValue.mockImplementation( () => Promise.resolve( value ) );
		mockPromptForReloadManifest.mockImplementation( () => Promise.resolve( false ) );

		await setEnvVarCommand( args, opts );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( promptForValue ).toHaveBeenCalled();
		expect( readVariableFromFile ).not.toHaveBeenCalled();
		expect( confirm ).not.toHaveBeenCalled();
		expect( promptForReloadManifest ).not.toHaveBeenCalled();
		expect( setEnvVar ).toHaveBeenCalledWith( 1, 3, name, value, false );
		expect( console.log ).toHaveBeenCalledWith(
			expect.stringContaining( 'Successfully set environment variable' )
		);
		expect( mockShowDeployWarning ).not.toHaveBeenCalled();
		expect( mockTrackEvent.mock.calls ).toEqual( [ executeEvent, successEvent ] );
	} );

	it( 'cancels when user does not confirm', async () => {
		const name = 'TEST_VARIABLE';
		const value = 'any value';
		const cancelEvent = [ 'envvar_set_user_cancelled_confirmation', eventPayload ];

		setFixtures( name );
		mockPromptForValue.mockImplementation( () => Promise.resolve( value ) );
		// First confirm is for value confirmation - return false to cancel
		mockConfirm.mockImplementation( () => Promise.resolve( false ) );

		await expect( () => setEnvVarCommand( args, opts ) ).rejects.toEqual( 'EXIT' );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( promptForValue ).toHaveBeenCalled();
		expect( confirm ).toHaveBeenCalled();
		expect( cancel ).toHaveBeenCalled();
		expect( setEnvVar ).not.toHaveBeenCalled();
		expect( mockTrackEvent.mock.calls ).toEqual( [ executeEvent, cancelEvent ] );
	} );

	it( 'rejects an invalid name and exits', async () => {
		const name = 'INVALID**VARIABLE';
		const errorEvent = [ 'envvar_set_invalid_name', eventPayload ];

		setFixtures( name );
		mockValidateNameWithMessage.mockImplementation( () => false );

		await expect( () => setEnvVarCommand( args, opts ) ).rejects.toEqual( 'EXIT' );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( process.exit ).toHaveBeenCalledWith( 1 );

		expect( promptForValue ).not.toHaveBeenCalled();
		expect( readVariableFromFile ).not.toHaveBeenCalled();
		expect( confirm ).not.toHaveBeenCalled();
		expect( setEnvVar ).not.toHaveBeenCalled();
		expect( mockTrackEvent.mock.calls ).toEqual( [ executeEvent, errorEvent ] );
	} );

	it( 'rethrows error thrown from setEnvVar', async () => {
		const name = 'TEST_VARIABLE';
		const value = 'some value';
		const thrownError = new Error( 'fetch error' );
		const errorEvent = [ 'envvar_set_mutation_error', eventPayload ];

		setFixtures( name );
		mockPromptForValue.mockImplementation( () => Promise.resolve( value ) );
		mockConfirm.mockImplementation( () => Promise.resolve( true ) );
		mockPromptForReloadManifest.mockImplementation( () => Promise.resolve( true ) );
		mockSetEnvVar.mockImplementation( () => Promise.reject( thrownError ) );

		await expect( () => setEnvVarCommand( args, opts ) ).rejects.toEqual( thrownError );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( promptForValue ).toHaveBeenCalled();
		expect( confirm ).toHaveBeenCalled();
		expect( promptForReloadManifest ).toHaveBeenCalled();
		expect( setEnvVar ).toHaveBeenCalledWith( 1, 3, name, value, true );
		expect( mockTrackEvent.mock.calls ).toEqual( [ executeEvent, errorEvent ] );
	} );

	it( 'passes false for reloadManifest when user declines reload', async () => {
		const name = 'TEST_VARIABLE';
		const value = 'test value';

		setFixtures( name );
		mockPromptForValue.mockImplementation( () => Promise.resolve( value ) );
		mockConfirm.mockImplementation( () => Promise.resolve( true ) );
		mockPromptForReloadManifest.mockImplementation( () => Promise.resolve( false ) );

		await setEnvVarCommand( args, opts );

		expect( promptForReloadManifest ).toHaveBeenCalledWith( 1 );
		expect( setEnvVar ).toHaveBeenCalledWith( 1, 3, name, value, false );
		expect( showDeployWarning ).toHaveBeenCalledWith();
	} );
} );
