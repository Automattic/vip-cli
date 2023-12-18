/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-return */
/**
 * External dependencies
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Internal dependencies
 */
import { PhpMyAdminCommand } from '../../src/commands/phpmyadmin';
import API from '../../src/lib/api';
import { CommandTracker } from '../../src/lib/tracker';

const mutationMock = jest.fn( async () => {
	return Promise.resolve( {
		data: {
			generatePHPMyAdminAccess: {
				url: 'http://test-url.com',
			},
		},
	} );
} );

jest.mock( '../../src/lib/api' );
jest.mocked( API ).mockImplementation( () => {
	return Promise.resolve( {
		mutate: mutationMock,
	} as any );
} );

describe( 'commands/PhpMyAdminCommand', () => {
	beforeEach( () => {} );

	describe( '.run', () => {
		const app = { id: 123 };
		const env = { id: 456, jobs: [] };
		const tracker = jest.fn() as CommandTracker;
		const cmd = new PhpMyAdminCommand( app, env, tracker );
		const openUrl = jest.spyOn( cmd, 'openUrl' );

		beforeEach( () => {
			openUrl.mockReset();
		} );

		it( 'should generate a URL by calling the right mutation', async () => {
			await cmd.run();
			expect( mutationMock ).toHaveBeenCalledWith( {
				mutation: expect.anything(),
				variables: {
					input: {
						environmentId: 456,
					},
				},
			} );
		} );

		it( 'should open the generated URL in browser', async () => {
			await cmd.run();
			expect( openUrl ).toHaveBeenCalledWith( 'http://test-url.com' );
		} );
	} );
} );
