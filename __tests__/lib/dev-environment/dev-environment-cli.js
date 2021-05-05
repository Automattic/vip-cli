/**
 * @format
 */

/**
 * External dependencies
 */
import { prompt, selectRunMock } from 'enquirer';
import fetch from 'node-fetch';

/**
 * Internal dependencies
 */

import { getEnvironmentName, getEnvironmentStartCommand, processComponentOptionInput, promptForText, promptForComponent } from 'lib/dev-environment/dev-environment-cli';
import dockerHubWPResponse from './docker-hub-wp-response.json';
import dockerHubJetpackResponse from './docker-hub-jetpack-response.json';

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

jest.mock( 'node-fetch' );
fetch.mockImplementation( url =>
	Promise.resolve( { json: () => Promise.resolve(
		url === 'https://hub.docker.com/v2/repositories/wpvipdev/wordpress/tags/?page_size=10'
			? dockerHubWPResponse
			: dockerHubJetpackResponse ) } ) );

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
				expected: 'vip dev-environment start',
			},
			{ // use custom name
				options: {
					slug: 'foo',
				},
				expected: 'vip dev-environment start --slug foo',
			},
			{ // construct name from app and env
				options: {
					app: '123',
					env: 'bar.car',
				},
				expected: 'vip @123.bar.car dev-environment start',
			},
			{ // custom name takes precedence
				options: {
					slug: 'foo',
					app: '123',
					env: 'bar.car',
				},
				expected: 'vip dev-environment start --slug foo',
			},
		] )( 'should get correct start command', async input => {
			const result = getEnvironmentStartCommand( input.options );

			expect( result ).toStrictEqual( input.expected );
		} );
	} );
	describe( 'processComponentOptionInput', () => {
		it.each( [
			{ // wordpress tag
				param: 5.6,
				option: 'wordpress',
				expected: {
					image: 'wpvipdev/wordpress',
					mode: 'image',
					tag: '5.6',
				},
			},
			{ // jetpack - mu
				param: 'mu',
				option: 'jetpack',
				expected: {
					mode: 'inherit',
				},
			},
			{ // muPlugins - path
				param: '~/path',
				option: 'muPlugins',
				expected: {
					mode: 'local',
					dir: '~/path',
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
