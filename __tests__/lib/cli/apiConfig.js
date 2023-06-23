/**
 * @format
 */

/**
 * External dependencies
 */
import { describe, it, expect, jest } from '@jest/globals';

/**
 * Internal dependencies
 */
import { checkFeatureEnabled, exitWhenFeatureDisabled } from '../../../src/lib/cli/apiConfig';
import * as featureFlags from '../../../src/lib/api/feature-flags';
import Token from '../../../src/lib/token';

jest.mock( '../../../src/lib/tracker' );
const getFeatureSpy = jest.spyOn( featureFlags, 'get' );

jest.spyOn( console, 'error' ).mockImplementation( () => {} );
jest.spyOn( console, 'log' ).mockImplementation( () => {} );

describe( 'apiConfig', () => {
	beforeEach( () => {
		getFeatureSpy.mockClear();

		return Token.set(
			'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWQiOjcsImlhdCI6MTUxNjIzOTAyMn0.RTJMXHhhiaCxQberZ5Pre7SBU3Ci8EvCyaOXoqG3pNA'
		);
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
