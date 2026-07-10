import { describe, expect, it } from '@jest/globals';

import {
	doesArgvHaveAtLeastOneParam,
	isTokenReadRequired,
} from '../../../src/lib/cli/startup-args';

describe( 'lib/cli/startup-args', () => {
	describe( 'doesArgvHaveAtLeastOneParam', () => {
		it( 'matches a param that appears anywhere before `--`', () => {
			expect(
				doesArgvHaveAtLeastOneParam( [ 'node', 'vip', '--help' ], [ '-h', '--help', 'help' ] )
			).toBe( true );
			expect(
				doesArgvHaveAtLeastOneParam(
					[ 'node', 'vip', 'wp', '--help', 'list' ],
					[ '-h', '--help', 'help' ]
				)
			).toBe( true );
		} );

		it( 'returns false when no param is present', () => {
			expect(
				doesArgvHaveAtLeastOneParam( [ 'node', 'vip', 'wp', 'list' ], [ '-h', '--help', 'help' ] )
			).toBe( false );
		} );

		it( 'ignores params that appear only after `--`', () => {
			expect(
				doesArgvHaveAtLeastOneParam(
					[ 'node', 'vip', 'wp', '@app.env', '--', '--help' ],
					[ '-h', '--help', 'help' ]
				)
			).toBe( false );
		} );

		it( 'still matches params before `--` even when the same param also follows `--`', () => {
			expect(
				doesArgvHaveAtLeastOneParam(
					[ 'node', 'vip', '--help', '--', '--help' ],
					[ '-h', '--help', 'help' ]
				)
			).toBe( true );
		} );

		it( 'handles argv with no `--` terminator', () => {
			expect( doesArgvHaveAtLeastOneParam( [ 'node', 'vip', 'logout' ], [ 'logout' ] ) ).toBe(
				true
			);
			expect( doesArgvHaveAtLeastOneParam( [ 'node', 'vip', 'whoami' ], [ 'logout' ] ) ).toBe(
				false
			);
		} );

		it( 'treats every argument as after the terminator when `--` is the first arg', () => {
			expect(
				doesArgvHaveAtLeastOneParam( [ '--', '--help', 'help' ], [ '-h', '--help', 'help' ] )
			).toBe( false );
		} );
	} );

	describe( 'isTokenReadRequired', () => {
		const allFalse = {
			isLoginCommand: false,
			isLogoutCommand: false,
			isHelpCommand: false,
			isVersionCommand: false,
			isDevEnvCommandWithoutEnv: false,
			isCustomDeployCmdWithKey: false,
		};

		it( 'requires the token when no flags are set (normal commands need auth)', () => {
			expect( isTokenReadRequired( allFalse ) ).toBe( true );
		} );

		it.each( [
			'isLogoutCommand',
			'isHelpCommand',
			'isVersionCommand',
			'isDevEnvCommandWithoutEnv',
			'isCustomDeployCmdWithKey',
		] )( 'skips the token read when %s alone is set', bypassFlag => {
			expect( isTokenReadRequired( { ...allFalse, [ bypassFlag ]: true } ) ).toBe( false );
		} );

		it( 'requires the token when isLoginCommand alone is set', () => {
			expect( isTokenReadRequired( { ...allFalse, isLoginCommand: true } ) ).toBe( true );
		} );

		it.each( [
			'isLogoutCommand',
			'isHelpCommand',
			'isVersionCommand',
			'isDevEnvCommandWithoutEnv',
			'isCustomDeployCmdWithKey',
		] )( 'requires the token when isLoginCommand is set even alongside %s', bypassFlag => {
			expect(
				isTokenReadRequired( { ...allFalse, isLoginCommand: true, [ bypassFlag ]: true } )
			).toBe( true );
		} );
	} );
} );
