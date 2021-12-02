/**
 * Internal dependencies
 */
import * as tracker from 'lib/tracker';
import * as logsLib from 'lib/logs/logs';
import * as exit from 'lib/cli/exit';
import { rollbar } from 'lib/rollbar';
import { getLogs } from 'bin/vip-logs';

jest.spyOn( console, 'log' ).mockImplementation( () => {} );
jest.spyOn( console, 'error' ).mockImplementation( () => {} );
jest.spyOn( rollbar, 'error' ).mockImplementation( () => {} );
jest.spyOn( exit, 'withError' ).mockImplementation( () => {
	throw 'EXIT WITH ERROR'; // throws to break the flow (the real implementation does a process.exit)
} );

jest.mock( 'lib/cli/command', () => {
	const commandMock = {
		argv: () => commandMock,
		examples: () => commandMock,
		option: () => commandMock,
	};
	return jest.fn( () => commandMock );
} );

jest.mock( 'lib/tracker', () => ( {
	trackEvent: jest.fn(),
} ) );

jest.mock( 'lib/logs/logs', () => ( {
	getRecentLogs: jest.fn(),
} ) );

describe( 'getLogs', () => {
	let opts;

	beforeEach( () => {
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
				isK8sResident: true,
			},
			type: 'app',
			limit: 500,
		};
	} );

	beforeEach( jest.clearAllMocks );

	it( 'should display the logs in the output', async () => {
		logsLib.getRecentLogs.mockImplementation( async () => [
			{ timestamp: '2021-11-05T20:18:36.234041811Z', message: 'My container message 1' },
			{ timestamp: '2021-11-09T20:47:07.301221112Z', message: 'My container message 2' },
		] );

		await getLogs( [], opts );

		expect( logsLib.getRecentLogs ).toHaveBeenCalledTimes( 1 );
		expect( logsLib.getRecentLogs ).toHaveBeenCalledWith( 1, 3, 'app', 500 );

		expect( console.log ).toHaveBeenCalledTimes( 2 );
		expect( console.log ).toHaveBeenNthCalledWith( 1, '2021-11-05T20:18:36.234041811Z My container message 1' );
		expect( console.log ).toHaveBeenNthCalledWith( 2, '2021-11-09T20:47:07.301221112Z My container message 2' );

		const trackingParams = {
			command: 'vip logs',
			org_id: 2,
			app_id: 1,
			env_id: 3,
			type: 'app',
			limit: 500,
		};

		expect( tracker.trackEvent ).toHaveBeenCalledTimes( 2 );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 1, 'logs_command_execute', trackingParams );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 2, 'logs_command_success', trackingParams );

		expect( rollbar.error ).not.toHaveBeenCalled();
	} );

	it( 'should show a message if no logs were found', async () => {
		logsLib.getRecentLogs.mockImplementation( async () => [] ); // empty logs

		await getLogs( [], opts );

		expect( logsLib.getRecentLogs ).toHaveBeenCalledTimes( 1 );
		expect( logsLib.getRecentLogs ).toHaveBeenCalledWith( 1, 3, 'app', 500 );

		expect( console.error ).toHaveBeenCalledTimes( 1 );
		expect( console.error ).toHaveBeenCalledWith( 'No logs found' ); // display error message

		const trackingParams = {
			command: 'vip logs',
			org_id: 2,
			app_id: 1,
			env_id: 3,
			type: 'app',
			limit: 500,
		};

		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 1, 'logs_command_execute', trackingParams );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 2, 'logs_command_success', trackingParams );

		expect( rollbar.error ).not.toHaveBeenCalled();
	} );

	it( 'should track unexpected errors', async () => {
		const error = new Error( 'My intentional Error' );
		logsLib.getRecentLogs.mockImplementation( async () => {
			throw error;
		} );

		const promise = getLogs( [], opts );

		await expect( promise ).rejects.toBe( 'EXIT WITH ERROR' );

		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
		expect( exit.withError ).toHaveBeenCalledWith( 'My intentional Error' );

		expect( logsLib.getRecentLogs ).toHaveBeenCalledTimes( 1 );
		expect( logsLib.getRecentLogs ).toHaveBeenCalledWith( 1, 3, 'app', 500 );

		expect( console.log ).not.toHaveBeenCalled();

		const trackingParams = {
			command: 'vip logs',
			org_id: 2,
			app_id: 1,
			env_id: 3,
			type: 'app',
			limit: 500,
		};

		expect( rollbar.error ).toHaveBeenCalledTimes( 1 );
		expect( rollbar.error ).toHaveBeenCalledWith( error );

		expect( tracker.trackEvent ).toHaveBeenCalledTimes( 2 );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 1, 'logs_command_execute', trackingParams );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 2, 'logs_command_error', {
			...trackingParams,
			error: 'My intentional Error',
		} );
	} );

	it( 'should exit with error if "type" is invalid', async () => {
		opts.type = 'my-type';

		const promise = getLogs( [], opts );

		await expect( promise ).rejects.toBe( 'EXIT WITH ERROR' );

		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
		expect( exit.withError ).toHaveBeenCalledWith( 'Invalid type: my-type. The supported types are: app, batch.' );

		expect( logsLib.getRecentLogs ).not.toHaveBeenCalled();

		expect( console.log ).not.toHaveBeenCalled();

		expect( tracker.trackEvent ).not.toHaveBeenCalled();

		expect( rollbar.error ).not.toHaveBeenCalled();
	} );

	it.each( [
		'abc',
		-1,
		0,
		12.4,
		5001,
	] )( 'should exit with error if "limit" is invalid (%p)', async limit => {
		opts.limit = limit;

		const promise = getLogs( [], opts );

		await expect( promise ).rejects.toBe( 'EXIT WITH ERROR' );

		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
		expect( exit.withError ).toHaveBeenCalledWith( `Invalid limit: ${ limit }. It should be a number between 1 and 5000.` );

		expect( logsLib.getRecentLogs ).not.toHaveBeenCalled();

		expect( console.log ).not.toHaveBeenCalled();

		expect( tracker.trackEvent ).not.toHaveBeenCalled();

		expect( rollbar.error ).not.toHaveBeenCalled();
	} );

	it( 'should exit with error if the site is not on k8s', async () => {
		opts.env.isK8sResident = false;

		const promise = getLogs( [], opts );

		await expect( promise ).rejects.toBe( 'EXIT WITH ERROR' );

		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
		expect( exit.withError ).toHaveBeenCalledWith( '`vip logs` is not supported for the specified environment.' );

		expect( logsLib.getRecentLogs ).not.toHaveBeenCalled();

		expect( console.log ).not.toHaveBeenCalled();

		expect( tracker.trackEvent ).not.toHaveBeenCalled();

		expect( rollbar.error ).not.toHaveBeenCalled();
	} );
} );

