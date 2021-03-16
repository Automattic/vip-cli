/**
 * @format
 */

/**
 * External dependencies
 */
import xdgBasedir from 'xdg-basedir';
import os from 'os';
import fs from 'fs';

/**
 * Internal dependencies
 */
import { getEnvironmentPath, startEnvironment, generateInstanceData } from 'lib/dev-environment';

jest.mock( 'xdg-basedir', () => ( {} ) );
jest.mock( 'fs' );

describe( 'lib/dev-environment', () => {
	describe( 'startEnvironment', () => {
		it.each( [
			{
				title: 'test-title',
			},
			{
				name: 'test-name',
				multisite: true,
			},
		] )( 'should throw for existing folder and setup arguments', async options => {
			const slug = 'foo';
			fs.existsSync.mockResolvedValue( true );

			const promise = startEnvironment( slug, options );

			const parameters = Object.keys( options ).join( ', ' );

			await expect( promise ).rejects.toEqual(
				new Error(
					`The environment ${ slug } already exists and we can not change it's configuration` +
					`( configuration parameters - ${ parameters } found ).` +
					' Destroy the environment first if you would like to recreate it.' )
			);
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
					phpVersion: '7.3',
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
					phpVersion: '7.3',
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
					phpVersion: '7.3',
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
					phpVersion: '7.3',
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
	describe( 'getEnvironmentPath', () => {
		it( 'should throw for empty name', async () => {
			expect(
				() => getEnvironmentPath( '' )
			).toThrow( new Error( 'Name was not provided' ) );
		} );
		it( 'should return correct location from xdg', async () => {
			xdgBasedir.data = 'bar';
			const name = 'foo';
			const filePath = getEnvironmentPath( name );

			expect( filePath ).toBe( `${ xdgBasedir.data }/vip/dev-environment/${ name }` );
		} );
		it( 'should return tmp path if xdg is not avaiable', async () => {
			xdgBasedir.data = '';
			const name = 'foo';
			const filePath = getEnvironmentPath( name );

			expect( filePath ).toBe( `${ os.tmpdir() }/vip/dev-environment/${ name }` );
		} );
	} );
} );
