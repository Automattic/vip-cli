/**
 * @format
 */

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { checkFeatureEnabled, exitWhenFeatureDisabled, checkIsVIP } from 'lib/cli/apiConfig';
import * as featureFlags from 'lib/api/feature-flags';

jest.mock( 'lib/tracker' );
const getFeatureSpy = jest.spyOn( featureFlags, 'get' );

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
	describe( 'checkIsVIP', () => {
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
			const check = await checkIsVIP();
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
			const check = await checkIsVIP();
			expect( getFeatureSpy ).toHaveBeenCalledTimes( 1 );
			expect( check ).toBe( false );
		} );
		it( 'returns false when the public API has no response', async () => {
			getFeatureSpy.mockImplementation( () => undefined );

			const check = await checkIsVIP();

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
