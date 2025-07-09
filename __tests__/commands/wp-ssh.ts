/* eslint-disable @typescript-eslint/no-explicit-any */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import Stream from 'node:stream';
import { Client } from 'ssh2';
import { PassThrough } from 'stream';

import { WPCliCommandOverSSH } from '../../src/commands/wp-ssh';
import API from '../../src/lib/api';
import { CommandTracker } from '../../src/lib/tracker';

const processExitMock = jest
	.spyOn( process, 'exit' )
	.mockImplementation( ( code?: string | number | null | undefined ) => {
		throw new Error( `Process exited with code: ${ code }` );
	} );

const consoleErrorMock = jest.spyOn( console, 'error' ).mockImplementation( () => {} );

const mockExec = jest.fn< Client[ 'exec' ] >();
const mockEnd = jest.fn< Client[ 'end' ] >();

const EventEmitter = jest.requireActual< typeof import('events') >( 'events' );

class MockClient extends EventEmitter {
	public connect() {
		this.emit( 'ready' );

		return this;
	}

	public exec = mockExec;

	public end = mockEnd;
}

jest.mock( 'ssh2', () => {
	const original = jest.requireActual< typeof import('ssh2') >( 'ssh2' );

	return {
		...original,
		__esModule: true,

		Client: jest.fn().mockImplementation( () => {
			return new MockClient();
		} ),
	};
} );

// Mock the API
const triggerWPCLIMutationMock = jest.fn( async () => {
	return Promise.resolve( {
		data: {
			triggerWPCLICommandOnAppEnvironment: {
				inputToken: 'test-token',
				sshAuthentication: {
					host: 'test-host',
					port: 22,
					username: 'test-user',
					privateKey: 'test-key',
					passphrase: 'test-passphrase',
				},
				command: {
					guid: 'test-guid',
				},
			},
		},
	} );
} );

jest.mock( '../../src/lib/api' );
jest.mocked( API ).mockImplementation(
	() =>
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		( {
			mutate: triggerWPCLIMutationMock,
		} as any )
);

// Mock tracker
const mockTracker = jest.fn() as CommandTracker;
jest.mock( '../../src/lib/tracker', () => ( {
	makeCommandTracker: jest.fn( () => mockTracker ),
} ) );

describe( 'WPCommand', () => {
	const app = { id: 123 };
	const env = { id: 456 };
	let cmd: WPCliCommandOverSSH;

	beforeEach( () => {
		jest.clearAllMocks();
		cmd = new WPCliCommandOverSSH( app, env );
	} );

	describe( 'run', () => {
		it( 'should pass the correct arguments to the SSH connection when executing a command', async () => {
			const dummyStream = new PassThrough();

			mockExec.mockImplementation( ( (
				_cmd: string,
				callback: ( err: undefined, stream: Stream ) => void
			) => {
				callback( undefined, dummyStream );

				// Simulate the SSH connection closing right after the command is executed
				dummyStream.emit( 'close' );
			} ) as Client[ 'exec' ] );

			await cmd.run( 'plugin list' );

			expect( mockExec ).toHaveBeenCalledWith(
				expect.stringMatching(
					/GUID=test-guid INPUT_TOKEN=test-token VERSION=\S+ ROWS=\d+ COLUMNS=\d+ TTY=\S+/
				),
				expect.anything()
			);

			dummyStream.end();

			expect( processExitMock ).not.toHaveBeenCalled();
		} );

		it( 'should throw an error when SSH connection failed', async () => {
			const dummyStream = new PassThrough();

			mockExec.mockImplementation( ( (
				_cmd: string,
				callback: ( err: Error, stream: Stream ) => void
			) => {
				callback( new Error( 'ops!' ), dummyStream );
			} ) as Client[ 'exec' ] );

			const result = cmd.run( 'plugin list' );

			await expect( result ).rejects.toThrow( 'Process exited with code: 1' );

			expect( consoleErrorMock ).toHaveBeenCalledWith( expect.stringMatching( /ops!/ ) );
		} );

		it( 'should throw an error when wp-cli command returned a non-zero status code', async () => {
			const dummyStream = new PassThrough();

			mockExec.mockImplementation( ( (
				_cmd: string,
				callback: ( err: undefined, stream: Stream ) => void
			) => {
				callback( undefined, dummyStream );

				// Simulate the SSH connection closing right after the command is executed
				dummyStream.emit( 'exit', 23 );
				dummyStream.emit( 'close' );
			} ) as Client[ 'exec' ] );

			const result = cmd.run( 'plugin list' );

			await expect( result ).rejects.toThrow( 'Process exited with code: 23' );
		} );
	} );
} );
