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
import { resolvePath } from '../../../src/lib/dev-environment/dev-environment-cli';
import { DEV_ENVIRONMENT_NOT_FOUND } from '../../../src/lib/constants/dev-environment';

jest.mock( 'xdg-basedir', () => ( {} ) );
jest.mock( 'fs' );
jest.mock( '../../../src/lib/api/app' );
jest.mock( '../../../src/lib/search-and-replace' );
jest.mock( '../../../src/lib/dev-environment/dev-environment-cli' );

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
				new Error( DEV_ENVIRONMENT_NOT_FOUND )
			);
		} );
	} );
	describe( 'destroyEnvironment', () => {
		it( 'should throw for NON existing folder', async () => {
			const slug = 'foo';
			fs.existsSync.mockReturnValue( false );

			const promise = destroyEnvironment( slug );

			await expect( promise ).rejects.toEqual(
				new Error( DEV_ENVIRONMENT_NOT_FOUND )
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

			const expectedPath = path.normalize( `${ xdgBasedir.data }/vip/dev-environment/${ name }` );

			expect( filePath ).toBe( expectedPath );
		} );

		it( 'should return tmp path if xdg is not available', async () => {
			xdgBasedir.data = '';
			const name = 'foo';
			const filePath = getEnvironmentPath( name );

			const expectedPath = path.normalize( `${ os.tmpdir() }/vip/dev-environment/${ name }` ); 

			expect( filePath ).toBe( expectedPath );
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
						primaryDomain: '',
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
							primaryDomain: {
								name: 'test.develop.com',
							},
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
						primaryDomain: 'test.develop.com',
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
		afterEach( () => {
			path.sep = '/';
		} );

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
			const resolvedPath = `${ os.homedir() }/testfile.sql`;
			resolvePath.mockReturnValue( resolvedPath );

			const promise = resolveImportPath( 'foo', 'testfile.sql', null, false );

			expect( searchAndReplace ).not.toHaveBeenCalled();

			await expect( promise ).resolves.toEqual(
				{
					resolvedPath: resolvedPath,
					inContainerPath: resolvedPath.replace( os.homedir(), '/user' ),
				}
			);
		} );

		it( 'should handle windows path correctly', async () => {
			path.sep = '\\';
			fs.existsSync.mockReturnValue( true );
			const resolvedPath = `${ os.homedir() }\\somewhere\\testfile.sql`;
			resolvePath.mockReturnValue( resolvedPath );

			const promise = resolveImportPath( 'foo', 'testfile.sql', null, false );

			await expect( promise ).resolves.toEqual(
				{
					resolvedPath: resolvedPath,
					inContainerPath: '/user/somewhere/testfile.sql',
				}
			);
		} );

		it( 'should call search and replace not in place with the proper arguments', async () => {
			searchAndReplace.mockReturnValue( {
				outputFileName: 'testfile.sql',
			} );
			const resolvedPath = `${ os.homedir() }/testfile.sql`;
			resolvePath.mockReturnValue( resolvedPath );

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
				inContainerPath: expectedPath,
			} );
		} );

		it( 'should call search and replace in place with the proper arguments', async () => {
			const resolvedPath = `${ os.homedir() }/testfile.sql`;
			resolvePath.mockReturnValue( resolvedPath );
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
