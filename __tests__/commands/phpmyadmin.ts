/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-return */
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

const generatePMAAccessMutationMock = jest.fn( async _param => {
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

const pmaEnabledQueryMockTrue = jest.fn( async _param => {
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
jest.mocked( API ).mockImplementation(
	() =>
		( {
			mutate: generatePMAAccessMutationMock,
			query: pmaEnabledQueryMockTrue,
		} ) as any
);

describe( 'commands/PhpMyAdminCommand', () => {
	beforeEach( () => {} );

	describe( '.run', () => {
		const app = { id: 123 };
		const env = { id: 456, jobs: [] };
		const tracker = jest.fn() as CommandTracker;
		const cmd = new PhpMyAdminCommand( app, env, tracker, true );
		const openUrl = jest.spyOn( cmd, 'openUrl' );

		beforeEach( () => {
			openUrl.mockReset();
		} );

		it.each(
			[
				{
					platform: { isK8sResident: true },
					note: 'Note: phpMyAdmin sessions are read-only. If you run a query that writes to DB, it will fail.',
				},
				{
					platform: { isK8sResident: false },
					note: '',
				},
				{
					platform: { isK8sResident: null },
					note: 'Note: phpMyAdmin sessions are read-only on VIP Kubernetes and read-write on WP Cloud.',
				},
				{
					platform: {},
					note: 'Note: phpMyAdmin sessions are read-only on VIP Kubernetes and read-write on WP Cloud.',
				},
			].flatMap( testCase => [ false, true ].map( silent => ( { ...testCase, silent } ) ) )
		)(
			'prints the appropriate access note for $platform with silent=$silent',
			async ( { platform, note, silent } ) => {
				const noteCmd = new PhpMyAdminCommand( app, { ...env, ...platform }, tracker, silent );
				const consoleSpy = jest.spyOn( console, 'log' ).mockImplementation( () => {} );
				try {
					await noteCmd.run( { print: true } );
					const notes = consoleSpy.mock.calls.filter(
						( [ message ] ) => typeof message === 'string' && message.includes( 'Note:' )
					);
					const expectedNote = expect.stringContaining( note );
					expect( notes ).toEqual( silent || ! note ? [] : [ [ expectedNote ] ] );
				} finally {
					consoleSpy.mockRestore();
				}
			}
		);

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

		it( 'should print the URL to stdout instead of opening browser when print option is set', async () => {
			const printCmd = new PhpMyAdminCommand( app, env, tracker, true );
			const printOpenUrl = jest.spyOn( printCmd, 'openUrl' );
			printOpenUrl.mockReset();
			const consoleSpy = jest.spyOn( console, 'log' );
			try {
				await printCmd.run( { print: true } );
				expect( printOpenUrl ).not.toHaveBeenCalled();
				expect( consoleSpy ).toHaveBeenCalledWith( 'http://test-url.com' );
			} finally {
				consoleSpy.mockRestore();
			}
		} );
	} );
} );
