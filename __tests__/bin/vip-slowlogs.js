/**
 * Internal dependencies
 */
import os from 'os';
import * as tracker from '../../src/lib/tracker';
import * as logsLib from '../../src/lib/app-logs/app-logs';
import * as exit from '../../src/lib/cli/exit';
import { getSlowlogs } from '../../src/bin/vip-slowlogs';

jest.spyOn( console, 'log' ).mockImplementation( () => {} );
jest.spyOn( console, 'error' ).mockImplementation( () => {} );
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

jest.mock( '../../src/lib/tracker', () => ( {
	trackEvent: jest.fn(),
} ) );

jest.mock( '../../src/lib/app-logs/app-slowlogs', () => ( {
	// Only mock what is really needed, otherwise exported constants like LIMIT_MAX would be `undefined` during the tests
	...jest.requireActual( '../../src/lib/app-logs/app-slowlogs' ),
	getRecentSlowlogs: jest.fn(),
} ) );

describe( 'getSlowlogs', () => {
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
			limit: 500,
			format: 'text',
		};
	} );

	beforeEach( jest.clearAllMocks );

	it( 'should display the logs in the output', async () => {
		logsLib.getRecentSlowlogs.mockImplementation( async () => ( {
			nextCursor: null,
			nodes: [
				{ timestamp: '2021-11-05T20:18:36.234041811Z', query: 'SELECT * FROM wp_posts', rowsSent: 1, rowsExamined: 1, queryTime: 0.1, requestUri: 'dashboard.wpvip.com' },
				{ timestamp: '2021-11-09T20:47:07.301221112Z', query: 'SELECT * FROM wp_posts', rowsSent: 1, rowsExamined: 1, queryTime: 0.1, requestUri: 'dashboard.wpvip.com' },
			],
		} ) );

		await getSlowlogs( [], opts );

		expect( logsLib.getRecentSlowlogs ).toHaveBeenCalledTimes( 1 );
		expect( logsLib.getRecentSlowlogs ).toHaveBeenCalledWith( 1, 3, 500 );

		expect( console.log ).toHaveBeenCalledTimes( 1 );
		expect( console.log ).toHaveBeenCalledWith(
			'2021-11-05T20:18:36.234041811Z My container message 1\n2021-11-09T20:47:07.301221112Z My container message 2'
		);

		const trackingParams = {
			command: 'vip slowlogs',
			org_id: 2,
			app_id: 1,
			env_id: 3,
			limit: 500,
			follow: false,
			format: 'text',
		};

		expect( tracker.trackEvent ).toHaveBeenCalledTimes( 2 );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 1, 'logs_command_execute', trackingParams );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 2, 'logs_command_success', {
			...trackingParams,
			total: 2,
		} );
	} );

	it( 'should display the logs in the output with JSON format', async () => {
		opts.format = 'json';

		logsLib.getRecentSlowlogs.mockImplementation( async () => ( {
			nextCursor: null,
			nodes: [
				{ timestamp: '2021-11-05T20:18:36.234041811Z', query: 'SELECT * FROM wp_posts', rowsSent: 1, rowsExamined: 1, queryTime: 0.1, requestUri: 'dashboard.wpvip.com' },
				{ timestamp: '2021-11-09T20:47:07.301221112Z', query: 'SELECT * FROM wp_posts', rowsSent: 1, rowsExamined: 1, queryTime: 0.1, requestUri: 'dashboard.wpvip.com' },
			],
		} ) );

		await getSlowlogs( [], opts );

		expect( console.log ).toHaveBeenCalledTimes( 1 );
		expect( console.log ).toHaveBeenCalledWith(
			/* eslint-disable indent */
`[
	{
		"timestamp": "2021-11-05T20:18:36.234041811Z",
		"query": "SELECT * FROM wp_posts",
		"rowsSent": 1,
		"rowsExamined": 1,
		"queryTime": 0.1,
		"requestUri": "dashboard.wpvip.com"
	},
	{
		"timestamp": "2021-11-09T20:47:07.301221112Z",
		"query": "SELECT * FROM wp_posts",
		"rowsSent": 1,
		"rowsExamined": 1,
		"queryTime": 0.1,
		"requestUri": "dashboard.wpvip.com"
	}
]`
			/* eslint-enable indent */
		);

		const trackingParams = {
			command: 'vip slowlogs',
			org_id: 2,
			app_id: 1,
			env_id: 3,
			limit: 500,
			follow: false,
			format: 'json',
		};

		expect( tracker.trackEvent ).toHaveBeenCalledTimes( 2 );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 1, 'logs_command_execute', trackingParams );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 2, 'logs_command_success', {
			...trackingParams,
			total: 2,
		} );
	} );

	it( 'should display the logs in the output with CSV format', async () => {
		opts.format = 'csv';

		logsLib.getRecentSlowlogs.mockImplementation( async () => ( {
			nextCursor: null,
			nodes: [
				{ timestamp: '2021-11-05T20:18:36.234041811Z', query: 'SELECT * FROM wp_posts', rowsSent: 1, rowsExamined: 1, queryTime: 0.1, requestUri: 'dashboard.wpvip.com' },
				{ timestamp: '2021-11-09T20:47:07.301221112Z', query: 'SELECT * FROM wp_posts', rowsSent: 1, rowsExamined: 1, queryTime: 0.1, requestUri: 'dashboard.wpvip.com' },
			],
		} ) );

		await getSlowlogs( [], opts );

		expect( console.log ).toHaveBeenCalledTimes( 1 );
		expect( console.log ).toHaveBeenCalledWith(
			/* eslint-disable max-len */
			`"timestamp","message"${ os.EOL }"2021-11-05T20:18:36.234041811Z","My container message 1"${ os.EOL }"2021-11-09T20:47:07.301221112Z","My container message 2 has ""double quotes"", 'single quotes', commas, multiple${ os.EOL }lines${ os.EOL }, and	tabs"`
			/* eslint-enable max-len */
		);

		const trackingParams = {
			command: 'vip slowlogs',
			org_id: 2,
			app_id: 1,
			env_id: 3,
			limit: 500,
			follow: false,
			format: 'csv',
		};

		expect( tracker.trackEvent ).toHaveBeenCalledTimes( 2 );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 1, 'logs_command_execute', trackingParams );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 2, 'logs_command_success', {
			...trackingParams,
			total: 2,
		} );
	} );

	it( 'should show a message if no logs were found', async () => {
		logsLib.getRecentSlowlogs.mockImplementation( async () => ( { nextCursor: null, nodes: [] } ) ); // empty logs

		await getSlowlogs( [], opts );

		expect( logsLib.getRecentSlowlogs ).toHaveBeenCalledTimes( 1 );
		expect( logsLib.getRecentSlowlogs ).toHaveBeenCalledWith( 1, 3, 500 );

		expect( console.error ).toHaveBeenCalledTimes( 1 );
		expect( console.error ).toHaveBeenCalledWith( 'No logs found' ); // display error message

		const trackingParams = {
			command: 'vip slowlogs',
			org_id: 2,
			app_id: 1,
			env_id: 3,
			limit: 500,
			follow: false,
			format: 'text',
		};

		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 1, 'logs_command_execute', trackingParams );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 2, 'logs_command_success', {
			...trackingParams,
			total: 0,
		} );
	} );

	it( 'should track unexpected errors', async () => {
		const error = new Error( 'My intentional Error' );
		logsLib.getRecentSlowlogs.mockImplementation( async () => {
			throw error;
		} );

		const promise = getSlowlogs( [], opts );

		await expect( promise ).rejects.toBe( 'EXIT WITH ERROR' );

		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
		expect( exit.withError ).toHaveBeenCalledWith( 'My intentional Error' );

		expect( logsLib.getRecentSlowlogs ).toHaveBeenCalledTimes( 1 );
		expect( logsLib.getRecentSlowlogs ).toHaveBeenCalledWith( 1, 3, 500 );

		expect( console.log ).not.toHaveBeenCalled();

		const trackingParams = {
			command: 'vip slowlogs',
			org_id: 2,
			app_id: 1,
			env_id: 3,
			limit: 500,
			follow: false,
			format: 'text',
		};

		expect( tracker.trackEvent ).toHaveBeenCalledTimes( 2 );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 1, 'logs_command_execute', trackingParams );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 2, 'logs_command_error', {
			...trackingParams,
			error: 'My intentional Error',
		} );
	} );

	it( 'should exit with error if "type" is invalid', async () => {
		opts.type = 'my-type';

		const promise = getSlowlogs( [], opts );

		await expect( promise ).rejects.toBe( 'EXIT WITH ERROR' );

		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
		expect( exit.withError ).toHaveBeenCalledWith( 'Invalid type: my-type. The supported types are: app, batch.' );

		expect( logsLib.getRecentSlowlogs ).not.toHaveBeenCalled();

		expect( console.log ).not.toHaveBeenCalled();

		expect( tracker.trackEvent ).not.toHaveBeenCalled();
	} );

	it( 'should exit with error if "format" is invalid', async () => {
		opts.format = 'jso';

		const promise = getSlowlogs( [], opts );

		await expect( promise ).rejects.toBe( 'EXIT WITH ERROR' );

		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
		expect( exit.withError ).toHaveBeenCalledWith( 'Invalid format: jso. The supported formats are: csv, json, text.' );

		expect( logsLib.getRecentSlowlogs ).not.toHaveBeenCalled();

		expect( console.log ).not.toHaveBeenCalled();

		expect( tracker.trackEvent ).not.toHaveBeenCalled();
	} );

	it.each( [
		'abc',
		-1,
		0,
		12.4,
		5001,
	] )( 'should exit with error if "limit" is invalid (%p)', async limit => {
		opts.limit = limit;

		const promise = getSlowlogs( [], opts );

		await expect( promise ).rejects.toBe( 'EXIT WITH ERROR' );

		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
		expect( exit.withError ).toHaveBeenCalledWith( `Invalid limit: ${ limit }. It should be a number between 1 and 5000.` );

		expect( logsLib.getRecentSlowlogs ).not.toHaveBeenCalled();

		expect( console.log ).not.toHaveBeenCalled();

		expect( tracker.trackEvent ).not.toHaveBeenCalled();
	} );
} );

