/**
 * @format
 */

/**
 * External dependencies
 */
import { prompt, selectRunMock } from 'enquirer';

/**
 * Internal dependencies
 */

import { getEnvironmentName, getEnvironmentStartCommand, processComponentOptionInput, promptForText, promptForComponent } from 'lib/dev-environment/dev-environment-cli';

jest.mock( 'enquirer', () => {
	const _selectRunMock = jest.fn();
	const SelectClass = class {};
	SelectClass.prototype.run = _selectRunMock;
	return {
		prompt: jest.fn(),
		Select: SelectClass,
		selectRunMock: _selectRunMock,
	};
} );

describe( 'lib/dev-environment/dev-environment-cli', () => {
	describe( 'getEnvironmentName', () => {
		it.each( [
			{ // default value
				options: {},
				expected: 'vip-local',
			},
			{ // use custom name
				options: {
					slug: 'foo',
				},
				expected: 'foo',
			},
			{ // construct name from app and env
				options: {
					app: '123',
					env: 'bar.car',
				},
				expected: '123-bar.car',
			},
			{ // custom name takes precedence
				options: {
					slug: 'foo',
					app: '123',
					env: 'bar.car',
				},
				expected: 'foo',
			},
		] )( 'should get correct name', async input => {
			const result = getEnvironmentName( input.options );

			expect( result ).toStrictEqual( input.expected );
		} );
	} );
	describe( 'getEnvironmentStartCommand', () => {
		it.each( [
			{ // default value
				options: {},
				expected: 'vip dev-env start',
			},
			{ // use custom name
				options: {
					slug: 'foo',
				},
				expected: 'vip dev-env start --slug foo',
			},
			{ // construct name from app and env
				options: {
					app: '123',
					env: 'bar.car',
				},
				expected: 'vip @123.bar.car dev-env start',
			},
			{ // custom name takes precedence
				options: {
					slug: 'foo',
					app: '123',
					env: 'bar.car',
				},
				expected: 'vip dev-env start --slug foo',
			},
		] )( 'should get correct start command', async input => {
			const result = getEnvironmentStartCommand( input.options );

			expect( result ).toStrictEqual( input.expected );
		} );
	} );
	describe( 'processComponentOptionInput', () => {
		it.each( [
			{ // base tag
				param: 5.6,
				allowLocal: true,
				expected: {
					mode: 'image',
					tag: '5.6',
				},
			},
			{ // if local is not allowed
				param: '/tmp/wp',
				allowLocal: false,
				expected: {
					mode: 'image',
					tag: '/tmp/wp',
				},
			},
			{ // if local is  allowed
				param: '~/path',
				allowLocal: true,
				expected: {
					mode: 'local',
					dir: '~/path',
				},
			},
		] )( 'should process options and use defaults', async input => {
			const result = processComponentOptionInput( input.param, input.allowLocal );

			expect( result ).toStrictEqual( input.expected );
		} );
	} );
	describe( 'promptForText', () => {
		it( 'should trim provided value', async () => {
			const providedValue = '  bar  ';

			prompt.mockResolvedValue( { input: providedValue } );

			const result = await promptForText( 'Give me something', 'foo' );

			expect( result ).toStrictEqual( 'bar' );
		} );
	} );
	describe( 'promptForComponent', () => {
		beforeEach( () => {
			selectRunMock.mockReset();
		} );

		it.each( [
			{ // mu plugins local
				component: 'muPlugins',
				mode: 'local',
				path: '/tmp',
				expected: {
					mode: 'local',
					dir: '/tmp',
				},
			},
			{ // muPlugins hav just one tag - auto
				component: 'muPlugins',
				mode: 'image',
				expected: {
					mode: 'image',
				},
			},
			{ // clientCode have just one tag
				component: 'clientCode',
				mode: 'image',
				expected: {
					mode: 'image',
				},
			},
		] )( 'should return correct component %p', async input => {
			prompt.mockResolvedValue( { input: input.path } );
			selectRunMock
				.mockResolvedValueOnce( input.mode )
				.mockResolvedValueOnce( input.path );

			const result = await promptForComponent( input.component, true );

			expect( result ).toStrictEqual( input.expected );
		} );

		it.each( [
			{
				tag: '5.6',
				expected: {
					mode: 'image',
					tag: '5.6',
				},
			},
		] )( 'should return correct component for wordpress %p', async input => {
			selectRunMock
				.mockResolvedValueOnce( input.tag );

			const result = await promptForComponent( 'wordpress', false );

			expect( result ).toStrictEqual( input.expected );
		} );
	} );
} );
