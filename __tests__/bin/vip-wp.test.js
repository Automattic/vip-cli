import { beforeEach, afterEach, expect, jest, test } from '@jest/globals';
import { EventEmitter } from 'node:events';

let mockHandler;
let mockReadline;
let mockSocket;
let mockStreamSocket;
let mockStreams;
const mockTrackEvent = jest.fn();

jest.mock( '../../src/lib/cli/command', () => ( {
	__esModule: true,
	default: () => {
		const runner = {
			option: () => runner,
			examples: () => runner,
			argv: ( argv, handler ) => {
				mockHandler = handler;
			},
		};
		return runner;
	},
	getEnvIdentifier: () => 'develop',
} ) );
jest.mock( '../../src/lib/api', () => ( {
	__esModule: true,
	API_HOST: 'https://test.invalid',
	disableGlobalGraphQLErrorHandling: jest.fn(),
	default: () => ( {
		mutate: async () => ( {
			data: {
				triggerWPCLICommandOnAppEnvironment: { command: { guid: 'test' }, inputToken: 'test' },
			},
		} ),
	} ),
} ) );
jest.mock( '../../src/commands/wp-ssh', () => ( { WPCliCommandOverSSH: jest.fn() } ) );
jest.mock( '../../src/lib/token', () => ( {
	__esModule: true,
	default: { get: async () => ( { raw: 'test' } ) },
} ) );
jest.mock( '../../src/lib/tracker', () => ( {
	trackEvent: ( ...args ) => mockTrackEvent( ...args ),
} ) );
jest.mock( '../../src/lib/http/proxy-agent', () => ( { createProxyAgent: jest.fn() } ) );
jest.mock( '../../src/lib/cli/prompt', () => ( { confirm: jest.fn() } ) );
jest.mock( 'readline', () => ( {
	__esModule: true,
	default: { createInterface: () => mockReadline },
} ) );
jest.mock( 'socket.io-client', () => ( { __esModule: true, default: () => mockSocket } ) );
jest.mock( 'socket.io-stream', () => {
	const factory = () => mockStreamSocket;
	factory.createStream = () => {
		const stream = new ( require( 'node:events' ).EventEmitter )();
		stream.pipe = jest.fn( () => stream );
		stream.unpipe = jest.fn();
		stream.destroy = jest.fn();
		mockStreams.push( stream );
		return stream;
	};
	return { __esModule: true, default: factory };
} );

const options = {
	app: { id: 1, name: 'test', typeId: 2, organization: { id: 1 } },
	env: {
		id: 2,
		type: 'develop',
		wpcliStrategy: 'websocket',
		primaryDomain: { name: 'test.invalid' },
	},
};

beforeEach( () => {
	jest.resetModules();
	jest.useFakeTimers();
	mockStreams = [];
	mockTrackEvent.mockReset().mockResolvedValue( undefined );
	mockReadline = new EventEmitter();
	for ( const method of [ 'pause', 'resume', 'prompt', 'clearLine', 'close', 'write' ] ) {
		mockReadline[ method ] = jest.fn();
	}
	mockSocket = new EventEmitter();
	mockStreamSocket = new EventEmitter();
	jest.spyOn( mockStreamSocket, 'emit' );
	mockSocket.close = jest.fn();
	mockSocket.io = new EventEmitter();
	mockSocket.io.opts = {};
	mockSocket.io.engine = { close: jest.fn() };
	jest.spyOn( process.stdin, 'pipe' ).mockReturnValue( process.stdin );
	jest.spyOn( process.stdin, 'unpipe' ).mockReturnValue( process.stdin );
	jest.spyOn( process.stdout, 'write' ).mockReturnValue( true );
	jest.spyOn( process, 'exit' ).mockImplementation( () => {} );
	jest.spyOn( console, 'log' ).mockImplementation( () => {} );
	require( '../../src/bin/vip-wp' );
} );

afterEach( () => {
	jest.clearAllTimers();
	jest.useRealTimers();
	jest.restoreAllMocks();
} );

async function startCommand( isSubShell = true ) {
	await mockHandler( isSubShell ? [] : [ 'option', 'get', 'home' ], options );
	await mockReadline.listeners( 'line' )[ 0 ]( 'wp option get home' );
}

test( 'stale stream completion and retry timers cannot finish a reconnected job', async () => {
	await startCommand();
	const oldStdout = mockStreams[ 0 ];
	oldStdout.emit( 'data', Buffer.from( 'old' ) );
	oldStdout.emit( 'end' );
	mockSocket.emit( 'retry' );
	mockSocket.io.emit( 'reconnect_attempt', 1 );
	mockSocket.io.emit( 'reconnect' );
	oldStdout.emit( 'end' );
	oldStdout.emit( 'error', new Error( 'stale stream' ) );
	oldStdout.emit( 'data', Buffer.from( 'stale' ) );
	mockSocket.io.emit( 'reconnect' );
	expect(
		mockStreamSocket.emit.mock.calls.filter( ( [ event ] ) => event === 'cmd' ).at( -1 )[ 1 ].offset
	).toBe( 3 );
	await jest.advanceTimersByTimeAsync( 6000 );
	expect( mockSocket.close ).not.toHaveBeenCalled();
	expect( mockSocket.io.engine.close ).not.toHaveBeenCalled();
	expect(
		mockTrackEvent.mock.calls.filter( ( [ event ] ) => event === 'wpcli_command_end' )
	).toHaveLength( 0 );
	mockSocket.emit( 'exit', { exitCode: 3, message: 'done' } );
	expect( mockSocket.close ).toHaveBeenCalledTimes( 1 );
} );

test( 'repeated reconnects retain one socket listener and finish exactly once', async () => {
	const externalErrorHandler = jest.fn();
	mockSocket.on( 'error', externalErrorHandler );
	await startCommand();
	mockSocket.io.emit( 'reconnect' );
	mockSocket.io.emit( 'reconnect' );
	for ( const event of [ 'exit', 'cancel', 'unauthorized', 'retry' ] ) {
		expect( mockSocket.listenerCount( event ) ).toBe( 1 );
	}
	expect( mockSocket.listeners( 'error' ) ).toContain( externalErrorHandler );
	expect( mockSocket.listenerCount( 'error' ) ).toBe( 2 );
	mockSocket.emit( 'exit', { exitCode: 3, message: 'done' } );
	mockSocket.emit( 'cancel', 'stale cancellation' );
	expect( process.exit ).not.toHaveBeenCalled();
	mockSocket.emit( 'exit', { exitCode: 3, message: 'done' } );
	expect( console.log.mock.calls.filter( ( [ message ] ) => message === 'done' ) ).toHaveLength(
		1
	);
	expect( mockSocket.close ).toHaveBeenCalledTimes( 1 );
	expect(
		mockTrackEvent.mock.calls.filter( ( [ event ] ) => event === 'wpcli_command_end' )
	).toHaveLength( 1 );
} );

test.each( [ false, true ] )(
	'one-shot exit waits for end telemetry (reject=%s)',
	async shouldReject => {
		let settle;
		const exited = new Promise( resolve => {
			process.exit.mockImplementation( code => resolve( code ) );
		} );
		mockTrackEvent.mockImplementation( event =>
			event === 'wpcli_command_end'
				? new Promise( ( resolve, reject ) => {
						settle = shouldReject ? reject : resolve;
				  } )
				: Promise.resolve()
		);
		await startCommand( false );
		mockSocket.emit( 'exit', { exitCode: 3 } );
		expect( process.exit ).not.toHaveBeenCalled();
		expect( mockSocket.close ).toHaveBeenCalledTimes( 1 );
		settle();
		await expect( exited ).resolves.toBe( 3 );
		expect( process.exit ).toHaveBeenCalledWith( 3 );
	}
);
