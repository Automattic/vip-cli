/**
 * @format
 */

import { describe, it, expect, jest } from '@jest/globals';

import * as featureFlags from '../../../src/lib/api/feature-flags';
import { checkFeatureEnabled, exitWhenFeatureDisabled } from '../../../src/lib/cli/apiConfig';

jest.mock( '../../../src/lib/tracker' );
jest.mock( '../../../src/lib/keychain', () => {
	const store = new Map();
	return {
		getKeychain: jest.fn( async () => ( {
			getPassword: async key => store.get( key ) ?? null,
			setPassword: async ( key, value ) => {
				store.set( key, value );
				return true;
			},
			deletePassword: async key => store.delete( key ),
		} ) ),
	};
} );
const getFeatureSpy = jest.spyOn( featureFlags, 'get' );

jest.spyOn( console, 'error' ).mockImplementation( () => {} );
jest.spyOn( console, 'log' ).mockImplementation( () => {} );

describe( 'apiConfig', () => {
	beforeEach( () => {
		getFeatureSpy.mockClear();
	} );

	describe( 'checkFeatureEnabled', () => {
		it( 'return true when the public API returns isVIP = true', async () => {
			getFeatureSpy.mockImplementation( () => {
				const res = {
					data: {
						me: {
							isVIP: true,
						},
					},
				};
				return res;
			} );
			const check = await checkFeatureEnabled( 'any' );
			expect( getFeatureSpy ).toHaveBeenCalledTimes( 1 );
			expect( check ).toBe( true );
		} );
		it( 'returns false when the public API return isVIP = false', async () => {
			getFeatureSpy.mockImplementation( () => {
				const res = {
					data: {
						me: {
							isVIP: false,
						},
					},
				};
				return res;
			} );
			const check = await checkFeatureEnabled( 'any' );
			expect( getFeatureSpy ).toHaveBeenCalledTimes( 1 );
			expect( check ).toBe( false );
		} );
		it( 'returns false when the public API has no response', async () => {
			getFeatureSpy.mockImplementation( () => undefined );
			const check = await checkFeatureEnabled( 'any' );
			expect( getFeatureSpy ).toHaveBeenCalledTimes( 1 );
			expect( check ).toBe( false );
		} );
	} );
	describe( 'exitWhenFeatureDisabled', () => {
		it( 'exits the process when isVIP is false', async () => {
			const mockExit = jest.spyOn( process, 'exit' ).mockImplementation( () => {} );
			getFeatureSpy.mockImplementation( () => {
				const res = {
					data: {
						me: {
							isVIP: false,
						},
					},
				};
				return res;
			} );
			await exitWhenFeatureDisabled( 'any' );
			expect( getFeatureSpy ).toHaveBeenCalledTimes( 1 );
			expect( mockExit ).toHaveBeenCalled();
		} );
	} );
} );
