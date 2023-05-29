// @flow

/**
 * External dependencies
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { Response } from 'node-fetch';

/**
 * Internal dependencies
 */
import { deleteEnvVarCommand } from '../../src/bin/vip-config-envvar-delete';
import command from '../../src/lib/cli/command';
import { deleteEnvVar, validateNameWithMessage } from '../../src/lib/envvar/api';
import { cancel, confirm, promptForValue } from '../../src/lib/envvar/input';
import { trackEvent } from '../../src/lib/tracker';

function mockExit() {
	throw 'EXIT'; // can't actually exit the test
}

jest.spyOn( console, 'log' ).mockImplementation( () => {} );
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

const mockConfirm: JestMockFn<[string], Promise<boolean>> = ( ( confirm: any ): JestMockFn<[string], Promise<boolean>> );
const mockValidateNameWithMessage: JestMockFn<[string], boolean> = ( ( validateNameWithMessage: any ): JestMockFn<[string], boolean> );
const mockPromptForValue: JestMockFn<[string, string], Promise<string>> = ( ( promptForValue: any ): JestMockFn<[string, string], Promise<string>> );
const mockDeleteEnvVar: JestMockFn<[number, number, string], Promise<void>> = ( ( deleteEnvVar: any ): JestMockFn<[number, number, string], Promise<void>> );
const mockTrackEvent: JestMockFn<[], Promise<Response>> = ( ( trackEvent: any ): JestMockFn<[], Promise<Response>> );

describe( 'deleteEnvVarCommand', () => {
	let args;
	let opts;
	const eventPayload = expect.objectContaining( { command: expect.stringContaining( 'vip @mysite.develop config envvar delete' ) } );
	const executeEvent = [ 'envvar_delete_command_execute', eventPayload ];
	const successEvent = [ 'envvar_delete_command_success', eventPayload ];

	function setFixtures( name: string, skipConfirmation: string = '' ) {
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
		mockConfirm.mockImplementation( () => Promise.resolve( true ) );
		mockValidateNameWithMessage.mockImplementation( () => true );
	} );

	it( 'validates the name, prompts for confirmation, deletes the variable, and prints success', async () => {
		const name = 'TEST_VARIABLE';

		setFixtures( name );
		mockPromptForValue.mockImplementation( () => Promise.resolve( name ) );

		await deleteEnvVarCommand( args, opts );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( promptForValue ).toHaveBeenCalled();
		expect( confirm ).toHaveBeenCalled();
		expect( deleteEnvVar ).toHaveBeenCalledWith( 1, 3, name );
		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'Successfully deleted environment variable' ) );
		expect( mockTrackEvent.mock.calls ).toEqual( [ executeEvent, successEvent ] );
	} );

	it( 'skips confirmation when --skip-confirmation is set', async () => {
		const name = 'TEST_VARIABLE';
		const skipConfirmation = 'yes';

		setFixtures( name, skipConfirmation );
		mockPromptForValue.mockImplementation( () => Promise.resolve( name ) );

		await deleteEnvVarCommand( args, opts );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( promptForValue ).not.toHaveBeenCalled();
		expect( confirm ).not.toHaveBeenCalled();
		expect( deleteEnvVar ).toHaveBeenCalledWith( 1, 3, name );
		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'Successfully deleted environment variable' ) );
		expect( mockTrackEvent.mock.calls ).toEqual( [ executeEvent, successEvent ] );
	} );

	it( 'cancels when user does not confirm', async () => {
		const name = 'TEST_VARIABLE';
		const cancelEvent = [ 'envvar_delete_user_cancelled_confirmation', eventPayload ];

		setFixtures( name );
		mockPromptForValue.mockImplementation( () => Promise.resolve( name ) );
		mockConfirm.mockImplementation( () => Promise.resolve( false ) );

		await expect( () => deleteEnvVarCommand( args, opts ) ).rejects.toEqual( 'EXIT' );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( promptForValue ).toHaveBeenCalled();
		expect( confirm ).toHaveBeenCalled();
		expect( cancel ).toHaveBeenCalled();
		expect( deleteEnvVar ).not.toHaveBeenCalled();
		expect( mockTrackEvent.mock.calls ).toEqual( [ executeEvent, cancelEvent ] );
	} );

	it( 'rejects an invalid name and exits', async () => {
		const name = 'INVALID**VARIABLE';
		const errorEvent = [ 'envvar_delete_invalid_name', eventPayload ];

		setFixtures( name );
		mockValidateNameWithMessage.mockImplementation( () => false );

		await expect( () => deleteEnvVarCommand( args, opts ) ).rejects.toEqual( 'EXIT' );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		// $FlowIgnore[method-unbinding] No idea how to fix this
		expect( process.exit ).toHaveBeenCalledWith( 1 );

		expect( promptForValue ).not.toHaveBeenCalled();
		expect( confirm ).not.toHaveBeenCalled();
		expect( deleteEnvVar ).not.toHaveBeenCalled();
		expect( mockTrackEvent.mock.calls ).toEqual( [ executeEvent, errorEvent ] );
	} );

	it( 'rethrows error thrown from deleteEnvVar', async () => {
		const name = 'TEST_VARIABLE';
		const thrownError = new Error( 'fetch error' );
		const errorEvent = [ 'envvar_delete_mutation_error', eventPayload ];

		setFixtures( name );
		mockPromptForValue.mockImplementation( () => Promise.resolve( name ) );
		mockDeleteEnvVar.mockImplementation( () => Promise.reject<void>( thrownError ) );

		await expect( () => deleteEnvVarCommand( args, opts ) ).rejects.toEqual( thrownError );

		expect( validateNameWithMessage ).toHaveBeenCalledWith( name );
		expect( promptForValue ).toHaveBeenCalled();
		expect( confirm ).toHaveBeenCalled();
		expect( deleteEnvVar ).toHaveBeenCalledWith( 1, 3, name );
		expect( mockTrackEvent.mock.calls ).toEqual( [ executeEvent, errorEvent ] );
	} );
} );
