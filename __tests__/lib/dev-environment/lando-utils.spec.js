import { dockerComposify, shellEscape } from 'lando/lib/utils';

describe( 'Lando utilities with ESM dependencies', () => {
	it( 'loads the utility used by dev-env E2E helpers', () => {
		expect( dockerComposify( 'VIP-test_env.example' ) ).toBe( 'viptestenvexample' );
	} );

	it( 'parses quoted tooling arguments through the string-argv bridge', () => {
		expect( shellEscape( 'wp option update blogname "My site"', false, [ 'wp' ] ) ).toEqual( [
			'wp',
			'option',
			'update',
			'blogname',
			'My site',
		] );
	} );
} );
