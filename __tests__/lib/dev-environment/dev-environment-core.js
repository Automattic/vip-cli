/**
 * @format
 */

/**
 * External dependencies
 */
import xdgBasedir from 'xdg-basedir';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Internal dependencies
 */
import app from '../../../src/lib/api/app';
import { getEnvironmentPath,
	createEnvironment,
	startEnvironment,
	destroyEnvironment,
	getApplicationInformation,
	resolveImportPath,
} from '../../../src/lib/dev-environment/dev-environment-core';
import { searchAndReplace } from '../../../src/lib/search-and-replace';

jest.mock( 'xdg-basedir', () => ( {} ) );
jest.mock( 'fs' );
jest.mock( '../../../src/lib/api/app' );
jest.mock( '../../../src/lib/search-and-replace' );

describe( 'lib/dev-environment/dev-environment-core', () => {
	beforeEach( () => {
		jest.clearAllMocks();
	} );

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
	describe( 'getApplicationInformation', () => {
		it.each( [
			{ // base app info
				appId: 123,
				envType: null,
				response: {
					id: 123,
					name: 'foo',
					repository: {
						htmlUrl: 'www.nice.repo',
					},
				},
				expected: {
					id: 123,
					name: 'foo',
					repository: 'www.nice.repo',
				},
			},
			{ // takes the env if there is just one
				appId: 123,
				envType: null,
				response: {
					id: 123,
					name: 'foo',
					repository: {
						htmlUrl: 'www.nice.repo',
					},
					environments: [
						{
							name: 'envName',
							type: 'develop',
							branch: 'dev',
							isMultisite: true,
						},
					],
				},
				expected: {
					id: 123,
					name: 'foo',
					repository: 'www.nice.repo',
					environment: {
						name: 'envName',
						type: 'develop',
						branch: 'dev',
						isMultisite: true,
					},
				},
			},
			{ // Does NOT take an env if there is more than one
				appId: 123,
				envType: null,
				response: {
					id: 123,
					name: 'foo',
					repository: {
						htmlUrl: 'www.nice.repo',
					},
					environments: [
						{
							name: 'envName',
						},
						{
							name: 'envName2',
						},
					],
				},
				expected: {
					id: 123,
					name: 'foo',
					repository: 'www.nice.repo',
				},
			},
			{ // picks env with correct type if type provided
				appId: 123,
				envType: 'develop',
				response: {
					id: 123,
					name: 'foo',
					repository: {
						htmlUrl: 'www.nice.repo',
					},
					environments: [
						{
							name: 'devName',
							type: 'develop',
							branch: 'dev',
							isMultisite: true,
						},
						{
							name: 'prodName',
							type: 'production',
							branch: 'prod',
							isMultisite: true,
						},
					],
				},
				expected: {
					id: 123,
					name: 'foo',
					repository: 'www.nice.repo',
					environment: {
						name: 'devName',
						type: 'develop',
						branch: 'dev',
						isMultisite: true,
					},
				},
			},
			{ // Does not pick env with incorrect type if type provided (even if there is just one)
				appId: 123,
				envType: 'develop',
				response: {
					id: 123,
					name: 'foo',
					repository: {
						htmlUrl: 'www.nice.repo',
					},
					environments: [
						{
							name: 'prodName',
							type: 'production',
							branch: 'prod',
							isMultisite: true,
						},
					],
				},
				expected: {
					id: 123,
					name: 'foo',
					repository: 'www.nice.repo',
				},
			},
		] )( 'should parse query result %p', async input => {
			app.mockResolvedValue( input.response );

			const result = await getApplicationInformation( input.appId, input.envType );

			expect( result ).toStrictEqual( input.expected );
		} );
	} );
	describe( 'resolveImportPath', () => {
		it( 'should throw if file does not exist', async () => {
			fs.existsSync.mockReturnValue( false );

			const promise = resolveImportPath( 'foo', 'testfile.sql', null, false );

			expect( searchAndReplace ).not.toHaveBeenCalled();

			await expect( promise ).rejects.toEqual(
				new Error( 'The provided file does not exist or it is not valid (see "--help" for examples)' )
			);
		} );

		it( 'should resolve the path and replace it with /user', async () => {
			fs.existsSync.mockReturnValue( true );

			const promise = resolveImportPath( 'foo', 'testfile.sql', null, false );

			expect( searchAndReplace ).not.toHaveBeenCalled();

			await expect( promise ).resolves.toEqual(
				{
					resolvedPath: path.resolve( 'testfile.sql' ),
					dockerPath: path.resolve( 'testfile.sql' ).replace( os.homedir(), '/user' ),
				}
			);
		} );

		it( 'should call search and replace not in place with the proper arguments', async () => {
			searchAndReplace.mockReturnValue( {
				outputFileName: 'testfile.sql',
			} );

			const resolvedPath = path.resolve( 'testfile.sql' );
			const searchReplace = 'testsite.com,testsite.net';

			const promise = resolveImportPath( 'foo', 'testfile.sql', searchReplace, false );

			expect( searchAndReplace ).toHaveBeenCalledTimes( 1 );
			expect( searchAndReplace ).toHaveBeenLastCalledWith( resolvedPath, searchReplace, {
				isImport: true,
				output: true,
				inPlace: false,
			} );

			const expectedPath = path.join( getEnvironmentPath( 'foo' ), 'testfile.sql' );

			await expect( promise ).resolves.toEqual( {
				resolvedPath: expectedPath,
				dockerPath: expectedPath,
			} );
		} );

		it( 'should call search and replace in place with the proper arguments', async () => {
			const resolvedPath = path.resolve( 'testfile.sql' );
			const searchReplace = 'testsite.com,testsite.net';

			await resolveImportPath( 'foo', 'testfile.sql', searchReplace, true );

			expect( searchAndReplace ).toHaveBeenCalledTimes( 1 );
			expect( searchAndReplace ).toHaveBeenLastCalledWith( resolvedPath, searchReplace, {
				isImport: true,
				output: true,
				inPlace: true,
			} );
		} );
	} );
} );
