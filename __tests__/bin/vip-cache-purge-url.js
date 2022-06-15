/**
 * Internal dependencies
 */
import * as tracker from 'lib/tracker';
import * as exit from 'lib/cli/exit';
import purgeCacheLib from 'lib/api/cache-purge';
import { cachePurgeCommand } from '../../src/bin/vip-cache-purge-url';
import { readFromFile } from 'lib/read-file';

jest.spyOn( console, 'log' ).mockImplementation( () => {} );
jest.spyOn( exit, 'withError' ).mockImplementation( () => {
	throw 'EXIT CACHE PURGE WITH ERROR'; // Prevent actually exiting like the lib does
} );

jest.mock( 'lib/cli/command', () => {
	const commandMock = {
		argv: () => commandMock,
		examples: () => commandMock,
		option: () => commandMock,
	};
	return jest.fn( () => commandMock );
} );

jest.mock( 'lib/api/cache-purge', () => ( {
	purgeCache: jest.fn(),
} ) );

jest.mock( 'lib/tracker', () => ( {
	trackEvent: jest.fn(),
} ) );

jest.mock( 'lib/read-file', () => ( {
	readFromFile: jest.fn(),
} ) );

describe( 'cachePurgeCommand()', () => {
	const args = [ 'url' ];
	const opts = {
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
	};

	beforeEach( jest.clearAllMocks );

	it( 'should return success when object is purged', async () => {
		purgeCacheLib.purgeCache.mockImplementation( () => {
			return {
				success: true,
				urls: [ 'url' ],
			};
		} );

		await cachePurgeCommand( args, opts );

		expect( console.log ).toHaveBeenCalledTimes( 1 );
		expect( console.log ).toHaveBeenCalledWith( '- Purged URL: url' );

		const trackingParams = {
			app_id: 1,
			command: 'vip cache purge-url',
			env_id: 3,
			from_file: false,
		};

		expect( tracker.trackEvent ).toHaveBeenCalledTimes( 2 );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 1, 'cache_purge_url_command_execute', trackingParams );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 2, 'cache_purge_url_command_success', trackingParams );
		expect( readFromFile ).not.toHaveBeenCalled();
	} );

	it( 'should handle error when request fails', async () => {
		purgeCacheLib.purgeCache.mockImplementation( () => {
			throw new Error( 'Domain domain.go-vip.net is not assigned to this environment' );
		} );

		const promise = cachePurgeCommand( args, opts );

		await expect( promise ).rejects.toBe( 'EXIT CACHE PURGE WITH ERROR' );

		expect( console.log ).toHaveBeenCalledTimes( 0 );

		const trackingParams = {
			app_id: 1,
			command: 'vip cache purge-url',
			env_id: 3,
			from_file: false,
		};

		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
		expect( exit.withError ).toHaveBeenCalledWith( 'Failed to purge URL(s) from page cache: Domain domain.go-vip.net is not assigned to this environment' );

		expect( tracker.trackEvent ).toHaveBeenCalledTimes( 2 );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 1, 'cache_purge_url_command_execute', trackingParams );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 2, 'cache_purge_url_command_error', { ...trackingParams, error: 'Domain domain.go-vip.net is not assigned to this environment' } );
		expect( readFromFile ).not.toHaveBeenCalled();
	} );

	it( 'should handle error if urls is empty', async () => {
		const promise = cachePurgeCommand( [], opts );

		await expect( promise ).rejects.toBe( 'EXIT CACHE PURGE WITH ERROR' );

		expect( console.log ).toHaveBeenCalledTimes( 0 );

		const trackingParams = {
			app_id: 1,
			command: 'vip cache purge-url',
			env_id: 3,
			from_file: false,
		};

		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
		expect( exit.withError ).toHaveBeenCalledWith( 'Please supply at least one URL.' );

		expect( tracker.trackEvent ).toHaveBeenCalledTimes( 2 );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 1, 'cache_purge_url_command_execute', trackingParams );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 2, 'cache_purge_url_command_error', { ...trackingParams, error: 'No URL provided' } );
		expect( readFromFile ).not.toHaveBeenCalled();
	} );
} );
