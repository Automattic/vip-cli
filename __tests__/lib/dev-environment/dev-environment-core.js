/**
 * @format
 */

/**
 * External dependencies
 */
import xdgBasedir from 'xdg-basedir';
import fs from 'fs';
import enquirer from 'enquirer';
import os from 'os';
import path from 'path';
import child from 'child_process';

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
import { bootstrapLando } from '../../../src/lib/dev-environment/dev-environment-lando';
import { EventEmitter } from 'stream';

jest.mock( 'xdg-basedir', () => ( {} ) );
jest.mock( '../../../src/lib/api/app' );
jest.mock( '../../../src/lib/search-and-replace' );
jest.mock( '../../../src/lib/dev-environment/dev-environment-cli' );

describe( 'lib/dev-environment/dev-environment-core', () => {
	const cleanup = () => fs.rmSync( path.join( os.tmpdir(), 'lando' ), { recursive: true, force: true } );

	beforeAll( cleanup );
	afterAll( cleanup );

	beforeEach( () => {
		jest.resetAllMocks();
		jest.restoreAllMocks();
	} );

	const mockedExec = ( command, options, callback ) => {
		const emitter = new EventEmitter();

		setImmediate( () => {
			if ( /docker-compose/.test( command ) ) {
				callback( null, '2.12.2', '' );
			} else if ( /docker/.test( command ) ) {
				callback( null, '23.0.4', '' );
			} else {
				callback( new Error(), '', '' );
			}
		} );

		return emitter;
	};

	describe( 'createEnvironment', () => {
		it( 'should throw for existing folder', () => {
			const slug = 'foo';
			jest.spyOn( fs, 'existsSync' ).mockReturnValueOnce( true );

			const promise = createEnvironment( { siteSlug: slug } );

			return expect( promise ).rejects.toEqual(
				new Error( 'Environment already exists.' )
			);
		} );
	} );
	describe( 'startEnvironment', () => {
		it( 'should throw for NON existing folder', async () => {
			const slug = 'foo';
			const expectedPath = getEnvironmentPath( slug );
			fs._originalExistsSync = fs.existsSync;
			jest.spyOn( fs, 'existsSync' ).mockImplementation( fpath => {
				if ( fpath === expectedPath ) {
					return false;
				}

				return fs._originalExistsSync( fpath );
			} );

			jest.spyOn( child, 'exec' ).mockImplementation( mockedExec );

			const lando = await bootstrapLando();
			const promise = startEnvironment( lando, slug );

			return expect( promise ).rejects.toEqual(
				new Error( DEV_ENVIRONMENT_NOT_FOUND )
			);
		} );
	} );
	describe( 'destroyEnvironment', () => {
		it( 'should throw for NON existing folder', async () => {
			delete process.env.DEBUG;
			const slug = 'foo';
			const expectedPath = getEnvironmentPath( slug );
			fs._originalExistsSync = fs.existsSync;
			jest.spyOn( fs, 'existsSync' ).mockImplementation( fpath => {
				if ( fpath === expectedPath ) {
					return false;
				}

				return fs._originalExistsSync( fpath );
			} );

			jest.spyOn( child, 'exec' ).mockImplementation( mockedExec );

			const lando = await bootstrapLando();
			const promise = destroyEnvironment( lando, slug );

			return expect( promise ).rejects.toEqual(
				new Error( DEV_ENVIRONMENT_NOT_FOUND )
			);
		} );
	} );

	describe( 'getEnvironmentPath', () => {
		it( 'should throw for empty name', () => {
			expect(
				() => getEnvironmentPath( '' )
			).toThrow( new Error( 'Name was not provided' ) );
		} );

		it( 'should return correct location from xdg', () => {
			xdgBasedir.data = 'bar';
			const name = 'foo';
			const filePath = getEnvironmentPath( name );

			const expectedPath = path.normalize( `${ xdgBasedir.data }/vip/dev-environment/${ name }` );

			expect( filePath ).toBe( expectedPath );
		} );

		it( 'should return tmp path if xdg is not available', () => {
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
						php: '',
						wordpress: '',
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
							softwareSettings: {
								php: {
									current: {
										version: '8.1',
									},
								},
								wordpress: {
									current: {
										version: '6.2',
									},
								},
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
						php: '8.1',
						wordpress: '6.2',
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

			jest.spyOn( enquirer, 'prompt' ).mockImplementation().mockResolvedValue( { env: '' } );

			const result = await getApplicationInformation( input.appId, input.envType );

			expect( result ).toStrictEqual( input.expected );
		} );
	} );
	describe( 'resolveImportPath', () => {
		it( 'should throw if file does not exist', async () => {
			jest.spyOn( fs, 'existsSync' ).mockReturnValue( false ); // import file does not exist

			const promise = resolveImportPath( 'foo', 'testfile.sql', null, false );

			expect( searchAndReplace ).not.toHaveBeenCalled();

			await expect( promise ).rejects.toEqual(
				new Error( 'The provided file undefined does not exist or it is not valid (see "--help" for examples)' )
			);
		} );

		it( 'should resolve the path', () => {
			jest.spyOn( fs, 'existsSync' ).mockReturnValue( true );
			jest.spyOn( fs, 'lstatSync' ).mockReturnValue( { isDirectory: () => false } );

			const resolvedPath = `${ os.homedir() }/testfile.sql`;
			resolvePath.mockReturnValue( resolvedPath );

			const promise = resolveImportPath( 'foo', 'testfile.sql', null, false );

			expect( searchAndReplace ).not.toHaveBeenCalled();

			return expect( promise ).resolves.toEqual( resolvedPath );
		} );

		it( 'should call search and replace not in place with the proper arguments', () => {
			searchAndReplace.mockReturnValue( {
				outputFileName: 'testfile.sql',
			} );
			const resolvedPath = `${ os.homedir() }/testfile.sql`;
			resolvePath.mockReturnValue( resolvedPath );

			jest.spyOn( fs, 'existsSync' ).mockReturnValue( true );
			jest.spyOn( fs, 'lstatSync' ).mockReturnValue( { isDirectory: () => false } );

			const searchReplace = 'testsite.com,testsite.net';

			const promise = resolveImportPath( 'foo', 'testfile.sql', searchReplace, false );

			expect( searchAndReplace ).toHaveBeenCalledTimes( 1 );
			expect( searchAndReplace ).toHaveBeenLastCalledWith( resolvedPath, searchReplace, {
				isImport: true,
				output: true,
				inPlace: false,
			} );

			return expect( promise ).resolves.toEqual( 'testfile.sql' );
		} );

		it( 'should call search and replace in place with the proper arguments', async () => {
			searchAndReplace.mockReturnValue( {
				outputFileName: 'testfile.sql',
			} );
			const resolvedPath = `${ os.homedir() }/testfile.sql`;
			resolvePath.mockReturnValue( resolvedPath );
			const searchReplace = 'testsite.com,testsite.net';

			jest.spyOn( fs, 'existsSync' ).mockReturnValue( true );
			jest.spyOn( fs, 'lstatSync' ).mockReturnValue( { isDirectory: () => false } );
			jest.spyOn( fs, 'copyFileSync' ).mockReturnValue( undefined );

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
