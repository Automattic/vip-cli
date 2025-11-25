import { type CmdState, initState, resetState, stateMachine } from '../../../src/lib/wp/helpers';

describe( 'vip-wp helpers', () => {
	test( 'initState', () => {
		const actual = initState();
		expect( actual ).toEqual( {
			state: 'S0',
			command: '',
			done: false,
		} );
	} );

	test( 'resetState', () => {
		const state: CmdState = {
			state: 'S3',
			command: 'wp some command',
			done: true,
		};

		resetState( state );

		expect( state ).toEqual( {
			state: 'S0',
			command: '',
			done: false,
		} );
	} );

	describe( 'stateMachine', () => {
		test( 'handles simple command', () => {
			const state = initState();
			stateMachine( state, 'wp plugin list' );

			expect( state ).toEqual(
				expect.objectContaining( {
					command: 'wp plugin list',
					done: true,
				} )
			);
		} );

		test( 'handles command with quotes and escapes', () => {
			const state = initState();
			stateMachine(
				state,
				`wp post create --post_title="John's \\"Great\\" Post" --post_content='This is a test\nNew line here'`
			);

			expect( state ).toEqual(
				expect.objectContaining( {
					command: `wp post create --post_title="John's \\"Great\\" Post" --post_content='This is a test\nNew line here'`,
					done: true,
				} )
			);
		} );

		test( 'handles multiline input', () => {
			const parts = [ `wp option set test216596 "`, 'aaa', 'bb\\"', 'cc"' ];

			const state = initState();
			for ( const part of parts ) {
				stateMachine( state, part );
			}

			expect( state ).toEqual(
				expect.objectContaining( {
					command: `wp option set test216596 "\naaa\nbb\\"\ncc"`,
					done: true,
				} )
			);
		} );

		test.each( [
			[ `wp option set xxx "inner single quote'"`, `wp option set xxx "inner single quote'"` ],
			[ `wp option set xxx 'inner double quote"'`, `wp option set xxx 'inner double quote"'` ],
			[
				`wp option set xxx "escaped double quote\\""`,
				`wp option set xxx "escaped double quote\\""`,
			],
		] )( 'handles nested quotes (%s)', ( input, expected ) => {
			const state = initState();
			stateMachine( state, input );

			expect( state ).toEqual(
				expect.objectContaining( {
					command: expected,
					done: true,
				} )
			);
		} );
	} );
} );
