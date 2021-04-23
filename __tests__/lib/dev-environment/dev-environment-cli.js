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

import { getEnvironmentName, generateInstanceData, processComponentOptionInput, promptForText, promptForComponent } from 'lib/dev-environment/dev-environment-cli';

jest.mock( 'enquirer', () => {
	const _selectRunMock = jest.fn();
	return {
		prompt: jest.fn(),
		// Select: jest.fn().mockImplementation( () => ( { run: jest.fn() } ) ),
		Select: class {
			run = _selectRunMock
		},
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
	describe( 'generateInstanceData', () => {
		it.each( [
			{
				// defaults
				slug: 'foo',
				options: {},
				expected: {
					siteSlug: 'foo',
					wpTitle: 'VIP Dev',
					phpVersion: '7.4',
					multisite: false,
					wordpress: {
						image: 'wpvipdev/wordpress',
						mode: 'image',
						tag: '5.6',
					},
					muPlugins: {
						image: 'wpvipdev/mu-plugins',
						mode: 'image',
						tag: 'auto',
					},
					jetpack: {
						mode: 'inherit',
					},
					clientCode: {
						mode: 'image',
						image: 'wpvipdev/skeleton',
						tag: '181a17d9aedf7da73730d65ccef3d8dbf172a5c5',
					},
				},
			},
			{
				// basic options
				slug: 'foo',
				options: {
					title: 'Not Dev',
					phpVersion: '4',
					multisite: true,
				},
				expected: {
					siteSlug: 'foo',
					wpTitle: 'Not Dev',
					phpVersion: '4',
					multisite: true,
					wordpress: {
						image: 'wpvipdev/wordpress',
						mode: 'image',
						tag: '5.6',
					},
					muPlugins: {
						image: 'wpvipdev/mu-plugins',
						mode: 'image',
						tag: 'auto',
					},
					jetpack: {
						mode: 'inherit',
					},
					clientCode: {
						mode: 'image',
						image: 'wpvipdev/skeleton',
						tag: '181a17d9aedf7da73730d65ccef3d8dbf172a5c5',
					},
				},
			},
			{
				// jetpack - mu
				slug: 'foo',
				options: {
					jetpack: 'mu',
				},
				expected: {
					siteSlug: 'foo',
					wpTitle: 'VIP Dev',
					phpVersion: '7.4',
					multisite: false,
					wordpress: {
						image: 'wpvipdev/wordpress',
						mode: 'image',
						tag: '5.6',
					},
					muPlugins: {
						image: 'wpvipdev/mu-plugins',
						mode: 'image',
						tag: 'auto',
					},
					jetpack: {
						mode: 'inherit',
					},
					clientCode: {
						mode: 'image',
						image: 'wpvipdev/skeleton',
						tag: '181a17d9aedf7da73730d65ccef3d8dbf172a5c5',
					},
				},
			},
			{
				// path to local
				slug: 'foo',
				options: {
					wordpress: '~/path',
					muPlugins: '~/path',
					jetpack: '~/path',
					clientCode: '~/path',
				},
				expected: {
					siteSlug: 'foo',
					wpTitle: 'VIP Dev',
					phpVersion: '7.4',
					multisite: false,
					wordpress: {
						mode: 'local',
						dir: '~/path',
					},
					muPlugins: {
						mode: 'local',
						dir: '~/path',
					},
					jetpack: {
						mode: 'local',
						dir: '~/path',
					},
					clientCode: {
						mode: 'local',
						dir: '~/path',
					},
				},
			},
			{
				// image tags
				slug: 'foo',
				options: {
					wordpress: 'tag',
					muPlugins: 'tag',
					jetpack: 'tag',
					clientCode: 'tag',
				},
				expected: {
					siteSlug: 'foo',
					wpTitle: 'VIP Dev',
					phpVersion: '7.4',
					multisite: false,
					wordpress: {
						mode: 'image',
						tag: 'tag',
						image: 'wpvipdev/wordpress',
					},
					muPlugins: {
						mode: 'image',
						image: 'wpvipdev/mu-plugins',
						tag: 'tag',
					},
					jetpack: {
						mode: 'image',
						image: 'wpvipdev/jetpack',
						tag: 'tag',
					},
					clientCode: {
						mode: 'image',
						image: 'wpvipdev/skeleton',
						tag: 'tag',
					},
				},
			},
		] )( 'should process options and use defaults', async input => {
			const result = generateInstanceData( input.slug, input.options );

			expect( result ).toStrictEqual( input.expected );
		} );
	} );
	describe( 'processComponentOptionInput', () => {
		it.each( [
			{
				param: 5.6,
				option: 'wordpress',
				expected: {
					image: 'wpvipdev/wordpress',
					mode: 'image',
					tag: '5.6',
				},
			},
		] )( 'should process options and use defaults', async input => {
			const result = processComponentOptionInput( input.param, input.option );

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
			{
				component: 'wordpress',
				mode: 'local',
				path: '/tmp',
				expected: {
					mode: 'local',
					dir: '/tmp',
				},
			},
			{
				component: 'wordpress',
				mode: 'image',
				path: '5.6',
				expected: {
					mode: 'image',
					image: 'wpvipdev/wordpress',
					tag: '5.6',
				},
			},
			{ // muPlugins hav just one tag - auto
				component: 'muPlugins',
				mode: 'image',
				expected: {
					mode: 'image',
					image: 'wpvipdev/mu-plugins',
					tag: 'auto',
				},
			},
			{ // jetpack inherit
				component: 'jetpack',
				mode: 'inherit',
				expected: {
					mode: 'inherit',
				},
			},
			{ // jetpack image
				component: 'jetpack',
				mode: 'image',
				path: '1',
				expected: {
					mode: 'image',
					image: 'wpvipdev/jetpack',
					tag: '1',
				},
			},
			{ // clientCode have just one tag
				component: 'clientCode',
				mode: 'image',
				expected: {
					mode: 'image',
					image: 'wpvipdev/skeleton',
					tag: '181a17d9aedf7da73730d65ccef3d8dbf172a5c5',
				},
			},
		] )( 'should return correct component %p', async input => {
			prompt.mockResolvedValue( { input: input.path } );
			selectRunMock
				.mockResolvedValueOnce( input.mode )
				.mockResolvedValueOnce( input.path );

			const result = await promptForComponent( input.component );

			expect( result ).toStrictEqual( input.expected );
		} );
	} );
} );
