import { getSlowlogs } from '../../src/bin/vip-slowlogs';
import * as slowlogsLib from '../../src/lib/app-slowlogs/app-slowlogs';
import * as exit from '../../src/lib/cli/exit';
import * as tracker from '../../src/lib/tracker';

jest.spyOn( console, 'log' ).mockImplementation( () => {} );
jest.spyOn( console, 'error' ).mockImplementation( () => {} );
jest.spyOn( exit, 'withError' ).mockImplementation( () => {
	throw 'EXIT WITH ERROR'; // throws to break the flow (the real implementation does a process.exit)
} );

jest.mock( '../../src/lib/cli/command', () => {
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

jest.mock( '../../src/lib/app-slowlogs/app-slowlogs', () => ( {
	// Only mock what is really needed, otherwise exported constants like LIMIT_MAX would be `undefined` during the tests
	...jest.requireActual( '../../src/lib/app-slowlogs/app-slowlogs' ),
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
			format: 'table',
		};
	} );

	beforeEach( jest.clearAllMocks );

	it( 'should display the slowlogs in the output', async () => {
		slowlogsLib.getRecentSlowlogs.mockImplementation( async () => ( {
			nextCursor: null,
			nodes: [
				{
					timestamp: '2021-11-05T20:18:36.234041811Z',
					query: 'SELECT * FROM wp_posts',
					rowsSent: 1,
					rowsExamined: 1,
					queryTime: 0.1,
					requestUri: 'dashboard.wpvip.com',
				},
				{
					timestamp: '2021-11-09T20:47:07.301221112Z',
					query: 'SELECT * FROM wp_posts',
					rowsSent: 1,
					rowsExamined: 1,
					queryTime: 0.1,
					requestUri: 'dashboard.wpvip.com',
				},
			],
		} ) );

		await getSlowlogs( [], opts );

		expect( slowlogsLib.getRecentSlowlogs ).toHaveBeenCalledTimes( 1 );
		expect( slowlogsLib.getRecentSlowlogs ).toHaveBeenCalledWith( 1, 3, 500 );

		expect( console.log ).toHaveBeenCalledTimes( 1 );
		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'timestamp' ) );
		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'rows sent' ) );
		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'rows examined' ) );
		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'query time' ) );
		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'request uri' ) );
		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'query' ) );
		expect( console.log ).toHaveBeenCalledWith(
			expect.stringContaining( '2021-11-05T20:18:36.234041811Z' )
		);
		expect( console.log ).toHaveBeenCalledWith(
			expect.stringContaining( '2021-11-09T20:47:07.301221112Z' )
		);
		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( '0.1' ) );
		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'dashboard.wpvip.com' ) );
		expect( console.log ).toHaveBeenCalledWith(
			expect.stringContaining( 'SELECT * FROM wp_posts' )
		);

		const trackingParams = {
			command: 'vip slowlogs',
			org_id: 2,
			app_id: 1,
			env_id: 3,
			limit: 500,
			follow: false,
			format: 'table',
		};

		expect( tracker.trackEvent ).toHaveBeenCalledTimes( 2 );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith(
			1,
			'slowlogs_command_execute',
			trackingParams
		);
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 2, 'slowlogs_command_success', {
			...trackingParams,
			total: 2,
		} );
	} );

	it( 'should display the slowlogs in the output with JSON format', async () => {
		opts.format = 'json';

		slowlogsLib.getRecentSlowlogs.mockImplementation( async () => ( {
			nextCursor: null,
			nodes: [
				{
					timestamp: '2021-11-05T20:18:36.234041811Z',
					query: 'SELECT * FROM wp_posts',
					rowsSent: 1,
					rowsExamined: 1,
					queryTime: 0.1,
					requestUri: 'dashboard.wpvip.com',
				},
				{
					timestamp: '2021-11-09T20:47:07.301221112Z',
					query: 'SELECT * FROM wp_posts',
					rowsSent: 1,
					rowsExamined: 1,
					queryTime: 0.1,
					requestUri: 'dashboard.wpvip.com',
				},
			],
		} ) );

		await getSlowlogs( [], opts );

		expect( console.log ).toHaveBeenCalledTimes( 1 );
		expect( console.log ).toHaveBeenCalledWith(
			/* eslint-disable indent */
			`[
	{
		"timestamp": "2021-11-05T20:18:36.234041811Z",
		"rowsSent": 1,
		"rowsExamined": 1,
		"queryTime": 0.1,
		"requestUri": "dashboard.wpvip.com",
		"query": "SELECT * FROM wp_posts"
	},
	{
		"timestamp": "2021-11-09T20:47:07.301221112Z",
		"rowsSent": 1,
		"rowsExamined": 1,
		"queryTime": 0.1,
		"requestUri": "dashboard.wpvip.com",
		"query": "SELECT * FROM wp_posts"
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
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith(
			1,
			'slowlogs_command_execute',
			trackingParams
		);
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 2, 'slowlogs_command_success', {
			...trackingParams,
			total: 2,
		} );
	} );

	it( 'should display the slowlogs in the output with CSV format', async () => {
		opts.format = 'csv';

		slowlogsLib.getRecentSlowlogs.mockImplementation( async () => ( {
			nextCursor: null,
			nodes: [
				{
					timestamp: '2021-11-05T20:18:36.234041811Z',
					rowsSent: 1,
					rowsExamined: 1,
					queryTime: 0.1,
					requestUri: 'dashboard.wpvip.com',
					query: 'SELECT * FROM wp_posts',
				},
				{
					timestamp: '2021-11-09T20:47:07.301221112Z',
					rowsSent: 1,
					rowsExamined: 1,
					queryTime: 0.1,
					requestUri: 'dashboard.wpvip.com',
					query: 'SELECT * FROM wp_posts',
				},
			],
		} ) );

		await getSlowlogs( [], opts );

		expect( console.log ).toHaveBeenCalledTimes( 1 );
		expect( console.log ).toHaveBeenCalledWith(
			/* eslint-disable max-len */
			`"timestamp","rows sent","rows examined","query time","request uri","query"\n"2021-11-05T20:18:36.234041811Z",1,1,0.1,"dashboard.wpvip.com","SELECT * FROM wp_posts"\n"2021-11-09T20:47:07.301221112Z",1,1,0.1,"dashboard.wpvip.com","SELECT * FROM wp_posts"`
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
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith(
			1,
			'slowlogs_command_execute',
			trackingParams
		);
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 2, 'slowlogs_command_success', {
			...trackingParams,
			total: 2,
		} );
	} );

	it( 'should show a message if no slowlogs were found', async () => {
		slowlogsLib.getRecentSlowlogs.mockImplementation( async () => ( {
			nextCursor: null,
			nodes: [],
		} ) ); // empty logs

		await getSlowlogs( [], opts );

		expect( slowlogsLib.getRecentSlowlogs ).toHaveBeenCalledTimes( 1 );
		expect( slowlogsLib.getRecentSlowlogs ).toHaveBeenCalledWith( 1, 3, 500 );

		expect( console.error ).toHaveBeenCalledTimes( 1 );
		expect( console.error ).toHaveBeenCalledWith( 'No logs found' ); // display error message

		const trackingParams = {
			command: 'vip slowlogs',
			org_id: 2,
			app_id: 1,
			env_id: 3,
			limit: 500,
			follow: false,
			format: 'table',
		};

		expect( tracker.trackEvent ).toHaveBeenNthCalledWith(
			1,
			'slowlogs_command_execute',
			trackingParams
		);
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 2, 'slowlogs_command_success', {
			...trackingParams,
			total: 0,
		} );
	} );

	it( 'should track unexpected errors', async () => {
		const error = new Error( 'My intentional Error' );
		slowlogsLib.getRecentSlowlogs.mockImplementation( async () => {
			throw error;
		} );

		const promise = getSlowlogs( [], opts );

		await expect( promise ).rejects.toBe( 'EXIT WITH ERROR' );

		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
		expect( exit.withError ).toHaveBeenCalledWith( 'My intentional Error' );

		expect( slowlogsLib.getRecentSlowlogs ).toHaveBeenCalledTimes( 1 );
		expect( slowlogsLib.getRecentSlowlogs ).toHaveBeenCalledWith( 1, 3, 500 );

		expect( console.log ).not.toHaveBeenCalled();

		const trackingParams = {
			command: 'vip slowlogs',
			org_id: 2,
			app_id: 1,
			env_id: 3,
			limit: 500,
			follow: false,
			format: 'table',
		};

		expect( tracker.trackEvent ).toHaveBeenCalledTimes( 2 );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith(
			1,
			'slowlogs_command_execute',
			trackingParams
		);
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 2, 'slowlogs_command_error', {
			...trackingParams,
			error: 'My intentional Error',
		} );
	} );

	it( 'should exit with error if "format" is invalid', async () => {
		opts.format = 'jso';

		const promise = getSlowlogs( [], opts );

		await expect( promise ).rejects.toBe( 'EXIT WITH ERROR' );

		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
		expect( exit.withError ).toHaveBeenCalledWith(
			'Invalid format: jso. The supported formats are: csv, json, table.'
		);

		expect( slowlogsLib.getRecentSlowlogs ).not.toHaveBeenCalled();

		expect( console.log ).not.toHaveBeenCalled();

		expect( tracker.trackEvent ).not.toHaveBeenCalled();
	} );

	it.each( [ 'abc', -1, 0, 12.4, 5001 ] )(
		'should exit with error if "limit" is invalid (%p)',
		async limit => {
			opts.limit = limit;

			const promise = getSlowlogs( [], opts );

			await expect( promise ).rejects.toBe( 'EXIT WITH ERROR' );

			expect( exit.withError ).toHaveBeenCalledTimes( 1 );
			expect( exit.withError ).toHaveBeenCalledWith(
				`Invalid limit: ${ limit }. Set the limit to an integer between 1 and 5000.`
			);

			expect( slowlogsLib.getRecentSlowlogs ).not.toHaveBeenCalled();

			expect( console.log ).not.toHaveBeenCalled();

			expect( tracker.trackEvent ).not.toHaveBeenCalled();
		}
	);
} );
