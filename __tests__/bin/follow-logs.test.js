import { setTimeout as delay } from 'timers/promises';

import { followLogs as followRuntime } from '../../src/bin/vip-logs';
import { followLogs as followSlow } from '../../src/bin/vip-slowlogs';
import { getRecentLogs } from '../../src/lib/app-logs/app-logs';
import { getRecentSlowlogs } from '../../src/lib/app-slowlogs/app-slowlogs';

jest.mock( 'timers/promises', () => ( { setTimeout: jest.fn() } ) );
jest.mock( '../../src/lib/app-logs/app-logs', () => ( { getRecentLogs: jest.fn() } ) );
jest.mock( '../../src/lib/app-slowlogs/app-slowlogs', () => ( { getRecentSlowlogs: jest.fn() } ) );
jest.mock( '../../src/lib/tracker', () => ( { trackEvent: jest.fn() } ) );
jest.mock( '../../src/lib/cli/command', () => {
	const command = { argv: () => command, examples: () => command, option: () => command };
	return jest.fn( () => command );
} );

describe( 'follow log polling', () => {
	const options = {
		app: { id: 11, organization: { id: 22 } },
		env: { id: 33 },
		type: 'app',
		limit: 7,
		format: 'json',
		follow: true,
	};
	let logSpy;
	let errorSpy;

	beforeEach( () => {
		jest.resetAllMocks();
		logSpy = jest.spyOn( console, 'log' ).mockImplementation( () => {} );
		errorSpy = jest.spyOn( console, 'error' ).mockImplementation( () => {} );
	} );
	afterEach( () => jest.restoreAllMocks() );

	it.each( [
		[ 'runtime', followRuntime, getRecentLogs, [ 11, 33, 'app' ], 5000, 'message' ],
		[ 'slow', followSlow, getRecentSlowlogs, [ 11, 33 ], 500, 'query' ],
	] )(
		'%s advances cursors, prints each page and backs off on later errors',
		async ( _name, follow, fetchLogs, target, maxLimit, field ) => {
			fetchLogs
				.mockResolvedValueOnce( {
					nodes: [ { timestamp: 'first-time', [ field ]: 'first-entry' } ],
					nextCursor: 'cursor-one',
					pollingDelaySeconds: 1,
				} )
				.mockResolvedValueOnce( {
					nodes: [ { timestamp: 'second-time', [ field ]: 'second-entry' } ],
					nextCursor: 'cursor-two',
					pollingDelaySeconds: 7,
				} )
				.mockRejectedValueOnce( new Error( 'later failure' ) );
			delay
				.mockResolvedValueOnce()
				.mockResolvedValueOnce()
				.mockRejectedValueOnce( new Error( 'stop polling' ) );

			await expect( follow( { ...options } ) ).rejects.toThrow( 'stop polling' );
			expect( fetchLogs.mock.calls ).toEqual( [
				[ ...target, 7, null ],
				[ ...target, maxLimit, 'cursor-one' ],
				[ ...target, maxLimit, 'cursor-two' ],
			] );
			expect( delay.mock.calls ).toEqual( [ [ 5000 ], [ 7000 ], [ 37000 ] ] );
			expect( logSpy ).toHaveBeenCalledTimes( 2 );
			expect( JSON.parse( logSpy.mock.calls[ 0 ][ 0 ] )[ 0 ][ field ] ).toBe( 'first-entry' );
			expect( JSON.parse( logSpy.mock.calls[ 1 ][ 0 ] )[ 0 ][ field ] ).toBe( 'second-entry' );
			expect( errorSpy ).toHaveBeenCalledWith( expect.stringContaining( '37 seconds' ) );
		}
	);

	it.each( [
		[ 'runtime', followRuntime, getRecentLogs ],
		[ 'slow', followSlow, getRecentSlowlogs ],
	] )(
		'%s stops immediately when the initial request fails',
		async ( _name, follow, fetchLogs ) => {
			fetchLogs.mockRejectedValueOnce( new Error( 'initial failure' ) );
			await expect( follow( { ...options } ) ).resolves.toBeUndefined();
			expect( fetchLogs ).toHaveBeenCalledTimes( 1 );
			expect( delay ).not.toHaveBeenCalled();
			expect( logSpy ).not.toHaveBeenCalled();
			expect( errorSpy ).toHaveBeenCalledTimes( 1 );
		}
	);

	it.each( [
		[ 'runtime', followRuntime, getRecentLogs ],
		[ 'slow', followSlow, getRecentSlowlogs ],
	] )( '%s caps repeated-error backoff at five minutes', async ( _name, follow, fetchLogs ) => {
		fetchLogs.mockResolvedValueOnce( { nodes: [], nextCursor: 'cursor', pollingDelaySeconds: 1 } );
		fetchLogs.mockRejectedValue( new Error( 'later failure' ) );
		let calls = 0;
		delay.mockImplementation( async () => {
			calls++;
			if ( calls === 12 ) throw new Error( 'stop polling' );
		} );
		await expect( follow( { ...options } ) ).rejects.toThrow( 'stop polling' );
		expect( delay.mock.calls[ 0 ] ).toEqual( [ 5000 ] );
		expect( delay.mock.calls.slice( -2 ) ).toEqual( [ [ 300000 ], [ 300000 ] ] );
		expect( delay.mock.calls.every( ( [ milliseconds ] ) => milliseconds <= 300000 ) ).toBe( true );
	} );
} );
