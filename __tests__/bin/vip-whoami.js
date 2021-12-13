/**
 * Internal dependencies
 */
import * as tracker from 'lib/tracker';
import * as exit from 'lib/cli/exit';
import apiUserLib from 'lib/api/user';
import { whoamiCommand } from 'bin/vip-whoami';

jest.spyOn( console, 'log' ).mockImplementation( () => {} );
jest.spyOn( exit, 'withError' ).mockImplementation( () => {
	throw 'EXIT WHOAMI WITH ERROR'; // Prevent actually exiting like the lib does
} );

jest.mock( 'lib/cli/command', () => {
	const commandMock = {
		argv: () => commandMock,
		examples: () => commandMock,
		option: () => commandMock,
	};
	return jest.fn( () => commandMock );
} );

jest.mock( 'lib/api/user', () => ( {
	getCurrentUserInfo: jest.fn(),
} ) );

jest.mock( 'lib/tracker', () => ( {
	trackEvent: jest.fn(),
} ) );

describe( 'whoamiCommand()', () => {
	beforeEach( jest.clearAllMocks );

	it( 'should display the current user information', async () => {
		apiUserLib.getCurrentUserInfo.mockImplementation( () => {
			return {
				id: 4,
				displayName: 'VIP User',
			};
		} );

		await whoamiCommand();

		expect( console.log ).toHaveBeenCalledTimes( 1 );
		expect( console.log ).toHaveBeenCalledWith(
			/* eslint-disable indent */
`- Howdy VIP User!
- Your user ID is 4`
			/* eslint-enable indent */
		);

		const trackingParams = {
			command: 'vip whoami',
		};

		expect( tracker.trackEvent ).toHaveBeenCalledTimes( 2 );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 1, 'whoami_command_execute', trackingParams );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 2, 'whoami_command_success', trackingParams );
	} );

	it( 'should display the current user information (for VIP Staff)', async () => {
		apiUserLib.getCurrentUserInfo.mockImplementation( () => {
			return {
				id: 4,
				displayName: 'VIP User',
				isVIP: true,
			};
		} );

		await whoamiCommand();

		expect( console.log ).toHaveBeenCalledTimes( 1 );
		expect( console.log ).toHaveBeenCalledWith(
			/* eslint-disable indent */
`- Howdy VIP User!
- Your user ID is 4
- Your account has VIP Staff permissions`
			/* eslint-enable indent */
		);

		const trackingParams = {
			command: 'vip whoami',
		};

		expect( tracker.trackEvent ).toHaveBeenCalledTimes( 2 );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 1, 'whoami_command_execute', trackingParams );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 2, 'whoami_command_success', trackingParams );
	} );

	it( 'should handle error on when whoami request fails', async () => {
		apiUserLib.getCurrentUserInfo.mockImplementation( () => {
			throw new Error( 'Something went wrong :(' );
		} );

		const promise = whoamiCommand();

		await expect( promise ).rejects.toBe( 'EXIT WHOAMI WITH ERROR' );

		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
		expect( exit.withError ).toHaveBeenCalledWith( 'Failed to fetch information about the currently logged-in user error: Something went wrong :(' );

		const trackingParams = {
			command: 'vip whoami',
		};

		expect( tracker.trackEvent ).toHaveBeenCalledTimes( 2 );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 1, 'whoami_command_execute', trackingParams );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 2, 'whoami_command_error', {
			...trackingParams,
			error: 'Something went wrong :(',
		} );
	} );
} );

