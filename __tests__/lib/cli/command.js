/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { containsAppEnvArgument } from 'lib/cli/command';

describe( 'utils/cli/command', () => {
	describe( 'containsAppEnvArgument', () => {
		it.each( [
			[
				[ 'test', 'one' ],
				false,
			],
			[
				[ 'test', '@123', 'dev-env' ],
				true,
			],
			[
				[ 'test', '@123.develop', 'dev-env' ],
				true,
			],
			[
				[ 'test', '--app', '123', 'dev-env' ],
				true,
			],
		] )( 'should identify app/env arguments - %p', ( argv, expected ) => {
			const result = containsAppEnvArgument( argv );
			expect( result ).toBe( expected );
		} );
	} );
} );
