import { type CmdState, initState, resetState, stateMachine } from '../../../src/lib/wp/helpers';

describe( 'vip-wp helpers', () => {
	test( 'initState', () => {
		const actual = initState();
		expect( actual ).toEqual( {
			state: 0,
			command: '',
			error: false,
			done: false,
		} );
	} );

	test( 'resetState', () => {
		const state: CmdState = {
			state: 3,
			command: 'wp some command',
			error: true,
			done: true,
		};

		resetState( state );

		expect( state ).toEqual( {
			state: 0,
			command: '',
			error: false,
			done: false,
		} );
	} );

	describe( 'stateMachine', () => {
		test( 'handles simple command', () => {
			const state = initState();
			stateMachine( state, 'wp plugin list' );

			expect( state ).toEqual(
				expect.objectContaining( {
					command: 'wp plugin list\n',
					error: false,
					done: true,
				} )
			);
		} );

		test( 'handles command with quotes and escapes', () => {
			const state = initState();
			stateMachine(
				state,
				`wp post create --post_title="John's \\"Great\\" Post" --post_content="This is a test\nNew line here"`
			);

			expect( state ).toEqual(
				expect.objectContaining( {
					command: `wp post create --post_title="John's \\"Great\\" Post" --post_content="This is a test\nNew line here"\n`,
					error: false,
					done: true,
				} )
			);
		} );

		test( 'handles multiline input', () => {
			const parts = [ `wp option set test216596 "`, 'aaa', 'bb\\"', 'cc"' ];

			const state = initState();
			for ( const part of parts ) {
				stateMachine( state, part );
				expect( state.error ).toBe( false );
			}

			expect( state ).toEqual(
				expect.objectContaining( {
					command: `wp option set test216596 "\naaa\nbb\\"\ncc"\n`,
					error: false,
					done: true,
				} )
			);
		} );
	} );
} );
