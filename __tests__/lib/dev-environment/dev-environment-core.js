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
import { getEnvironmentPath,
	createEnvironment,
	startEnvironment,
	destroyEnvironment } from 'lib/dev-environment/dev-environment-core';

jest.mock( 'xdg-basedir', () => ( {} ) );
jest.mock( 'fs' );

describe( 'lib/dev-environment/dev-environment-core', () => {
	describe( 'createEnvironment', () => {
		it( 'should throw for existing folder', async () => {
			const slug = 'foo';
			fs.existsSync.mockReturnValue( true );

			const promise = createEnvironment( { siteSlug: slug } );

			await expect( promise ).rejects.toEqual(
				new Error( 'Environment already exists.' )
			);
		} );
	} );
	describe( 'startEnvironment', () => {
		it( 'should throw for NON existing folder', async () => {
			const slug = 'foo';
			fs.existsSync.mockReturnValue( false );

			const promise = startEnvironment( slug );

			await expect( promise ).rejects.toEqual(
				new Error( 'Environment not found.' )
			);
		} );
	} );
	describe( 'destroyEnvironment', () => {
		it( 'should throw for NON existing folder', async () => {
			const slug = 'foo';
			fs.existsSync.mockReturnValue( false );

			const promise = destroyEnvironment( slug );

			await expect( promise ).rejects.toEqual(
				new Error( 'Environment not found.' )
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
