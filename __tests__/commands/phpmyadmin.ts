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

const generatePMAAccessMutationMock = jest.fn( async () => {
	return Promise.resolve( {
		data: {
			generatePHPMyAdminAccess: {
				url: 'http://test-url.com',
			},
		},
	} );
} );

const enablePMAMutationMock = jest.fn( async () => {
	return Promise.resolve( {
		data: {
			enablePHPMyAdmin: {
				success: true,
			},
		},
	} );
} );

const pmaEnabledQueryMockTrue = jest.fn( async () => {
	return Promise.resolve( {
		data: {
			app: {
				environments: [
					{
						phpMyAdminStatus: {
							status: 'enabled',
						},
					},
				],
			},
		},
	} );
} );

jest.mock( '../../src/lib/api' );
jest.mocked( API ).mockImplementation( () => {
	return Promise.resolve( {
		mutate: generatePMAAccessMutationMock,
		query: pmaEnabledQueryMockTrue,
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

		it( 'should open the generated URL in browser', async () => {
			await cmd.run();
			expect( pmaEnabledQueryMockTrue ).toHaveBeenCalledWith( {
				query: expect.anything(),
				variables: {
					appId: 123,
					envId: 456,
				},
				fetchPolicy: 'network-only',
			} );
			expect( enablePMAMutationMock ).not.toHaveBeenCalled();
			expect( generatePMAAccessMutationMock ).toHaveBeenCalledWith( {
				mutation: expect.anything(),
				variables: {
					input: {
						environmentId: 456,
					},
				},
			} );
			expect( openUrl ).toHaveBeenCalledWith( 'http://test-url.com' );
		} );
	} );
} );
