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
import { getEnvironmentPath, startEnvironment } from 'lib/dev-environment';

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
