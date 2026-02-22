import { expect, jest } from '@jest/globals';
import enquirer from 'enquirer';
import fs from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

import app from '../../../src/lib/api/app';
import { DEV_ENVIRONMENT_NOT_FOUND } from '../../../src/lib/constants/dev-environment';
import { resolvePath } from '../../../src/lib/dev-environment/dev-environment-cli';
import {
	getEnvironmentPath,
	createEnvironment,
	startEnvironment,
	destroyEnvironment,
	getApplicationInformation,
	resolveImportPath,
	readEnvironmentData,
} from '../../../src/lib/dev-environment/dev-environment-core';
import {
	isEnvUp,
	landoInfo,
	landoRebuild,
	landoStart,
	getProxyContainer,
} from '../../../src/lib/dev-environment/dev-environment-lando';
import { searchAndReplace } from '../../../src/lib/search-and-replace';
import UserError from '../../../src/lib/user-error';
import { xdgData } from '../../../src/lib/xdg-data';

jest.mock( '../../../src/lib/api/app' );
jest.mock( '../../../src/lib/search-and-replace' );
jest.mock( '../../../src/lib/dev-environment/dev-environment-cli' );
jest.mock( '../../../src/lib/dev-environment/dev-environment-lando' );

describe( 'lib/dev-environment/dev-environment-core', () => {
	const cleanup = () =>
		fs.rmSync( path.join( tmpdir(), 'lando' ), { recursive: true, force: true } );

	beforeAll( cleanup );
	afterAll( cleanup );

	beforeEach( () => {
		jest.resetAllMocks();
		jest.restoreAllMocks();
	} );

	describe( 'createEnvironment', () => {
		it( 'should throw for existing folder', () => {
			const slug = 'foo';
			jest.spyOn( fs, 'existsSync' ).mockReturnValueOnce( true );

			const promise = createEnvironment( {}, { siteSlug: slug } );

			return expect( promise ).rejects.toEqual( new Error( 'Environment already exists.' ) );
		} );
	} );
	describe( 'startEnvironment', () => {
		it( 'should throw for NON existing folder', async () => {
			const slug = 'foo';
			const expectedPath = getEnvironmentPath( slug );
			const _originalExistsSync = fs.existsSync;
			jest.spyOn( fs, 'existsSync' ).mockImplementation( fpath => {
				if ( fpath === expectedPath ) {
					return false;
				}

				return _originalExistsSync( fpath );
			} );

			const promise = startEnvironment( {}, slug, {
				skipRebuild: false,
				skipWpVersionsCheck: true,
			} );

			return expect( promise ).rejects.toEqual( new Error( DEV_ENVIRONMENT_NOT_FOUND ) );
		} );

		describe( 'readiness polling and retry', () => {
			const slug = 'readiness-test-slug';
			const instanceData = JSON.stringify( {
				siteSlug: slug,
				wpTitle: 'Test',
				multisite: false,
				wordpress: { mode: 'image', tag: 'trunk' },
				muPlugins: { mode: 'image' },
				appCode: { mode: 'image' },
				mediaRedirectDomain: '',
				phpmyadmin: false,
				xdebug: false,
				php: 'php:8.2',
				mailpit: false,
				photon: false,
				cron: false,
				version: '2.3.2',
			} );

			beforeEach( () => {
				const expectedPath = getEnvironmentPath( slug );
				const instanceDataPath = path.join( expectedPath, 'instance_data.json' );
				const _originalExistsSync = fs.existsSync;
				const _originalReadFileSync = fs.readFileSync;
				jest.spyOn( fs, 'existsSync' ).mockImplementation( fpath => {
					if ( fpath === expectedPath ) {
						return true;
					}
					return _originalExistsSync( fpath );
				} );
				jest.spyOn( fs, 'appendFileSync' ).mockReturnValue( undefined );
				jest.spyOn( fs, 'readFileSync' ).mockImplementation( ( filePath, ...args ) => {
					if ( filePath === instanceDataPath ) {
						return instanceData;
					}
					return _originalReadFileSync( filePath, ...args );
				} );
				jest.spyOn( fs.promises, 'stat' ).mockResolvedValue( { isFile: () => true } );

				getProxyContainer.mockResolvedValue( { State: { Running: true } } );
				landoRebuild.mockResolvedValue( undefined );
				landoStart.mockResolvedValue( undefined );
				landoInfo.mockResolvedValue( {} );
			} );

			it( 'should succeed without retrying when environment is up on the first readiness check', async () => {
				isEnvUp.mockResolvedValue( true );

				await startEnvironment( {}, slug, {
					skipRebuild: false,
					skipWpVersionsCheck: true,
				} );

				expect( isEnvUp ).toHaveBeenCalledTimes( 1 );
				expect( landoRebuild ).toHaveBeenCalledTimes( 1 );
				expect( landoStart ).not.toHaveBeenCalled();
			} );

			it( 'should call landoStart retry when first readiness pass times out and succeed on second pass', async () => {
				// First waitForEnvironmentToBeUp: all 6 attempts return false
				// Second waitForEnvironmentToBeUp: succeeds on the first attempt
				isEnvUp
					.mockResolvedValueOnce( false )
					.mockResolvedValueOnce( false )
					.mockResolvedValueOnce( false )
					.mockResolvedValueOnce( false )
					.mockResolvedValueOnce( false )
					.mockResolvedValueOnce( false )
					.mockResolvedValueOnce( true );

				jest.useFakeTimers();
				try {
					const promise = startEnvironment( {}, slug, {
						skipRebuild: false,
						skipWpVersionsCheck: true,
					} );
					await jest.runAllTimersAsync();
					await promise;
				} finally {
					jest.useRealTimers();
				}

				expect( landoRebuild ).toHaveBeenCalledTimes( 1 );
				expect( landoStart ).toHaveBeenCalledTimes( 1 ); // retry pass
				expect( isEnvUp ).toHaveBeenCalledTimes( 7 ); // 6 failed + 1 success
			} );

			it( 'should throw UserError when environment never reaches a running state', async () => {
				isEnvUp.mockResolvedValue( false ); // all attempts fail

				jest.useFakeTimers();
				try {
					const promise = startEnvironment( {}, slug, {
						skipRebuild: false,
						skipWpVersionsCheck: true,
					} );
					// Register rejection handler before timers to prevent unhandled rejection
					const assertion = expect( promise ).rejects.toThrow( UserError );
					await jest.runAllTimersAsync();
					await assertion;
				} finally {
					jest.useRealTimers();
				}

				expect( landoStart ).toHaveBeenCalledTimes( 1 ); // retry pass attempted
				expect( isEnvUp ).toHaveBeenCalledTimes( 12 ); // 6 + 6 attempts
			} );
		} );
	} );
	describe( 'destroyEnvironment', () => {
		it( 'should throw for NON existing folder', async () => {
			delete process.env.DEBUG;
			const slug = 'foo';
			const expectedPath = getEnvironmentPath( slug );
			const _originalExistsSync = fs.existsSync;
			jest.spyOn( fs, 'existsSync' ).mockImplementation( fpath => {
				if ( fpath === expectedPath ) {
					return false;
				}

				return _originalExistsSync( fpath );
			} );

			const promise = destroyEnvironment( {}, slug, true );

			return expect( promise ).rejects.toEqual( new Error( DEV_ENVIRONMENT_NOT_FOUND ) );
		} );
	} );

	describe( 'getEnvironmentPath', () => {
		it( 'should throw for empty name', () => {
			expect( () => getEnvironmentPath( '' ) ).toThrow( new Error( 'Name was not provided' ) );
		} );

		it( 'should return correct location from xdg', () => {
			const name = 'foo';
			const filePath = getEnvironmentPath( name );

			const expectedPath = path.normalize( `${ xdgData() }/vip/dev-environment/${ name }` );

			expect( filePath ).toBe( expectedPath );
		} );
	} );
	describe( 'getApplicationInformation', () => {
		it.each( [
			{
				// base app info
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
			{
				// takes the env if there is just one
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
						integrations: {},
						envVars: {},
					},
				},
			},
			{
				// Does NOT take an env if there is more than one
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
			{
				// picks env with correct type if type provided
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
							integrations: {},
							envVars: {},
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
						integrations: {},
						envVars: {},
					},
				},
			},
			{
				// Does not pick env with incorrect type if type provided (even if there is just one)
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
				new Error(
					'The provided file undefined does not exist or it is not valid (see "--help" for examples)'
				)
			);
		} );

		it( 'should resolve the path', () => {
			jest.spyOn( fs, 'existsSync' ).mockReturnValue( true );
			jest.spyOn( fs, 'lstatSync' ).mockReturnValue( { isDirectory: () => false } );

			const resolvedPath = `${ homedir() }/testfile.sql`;
			resolvePath.mockReturnValue( resolvedPath );

			const promise = resolveImportPath( 'foo', 'testfile.sql', null, false );

			expect( searchAndReplace ).not.toHaveBeenCalled();

			return expect( promise ).resolves.toEqual( resolvedPath );
		} );

		it( 'should call search and replace not in place with the proper arguments', () => {
			searchAndReplace.mockReturnValue( {
				outputFileName: 'testfile.sql',
			} );
			const resolvedPath = `${ homedir() }/testfile.sql`;
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
			const resolvedPath = `${ homedir() }/testfile.sql`;
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

	describe( 'readEnvironmentData', () => {
		it( 'should throw an error when the file is not readable', () => {
			jest.spyOn( fs, 'readFileSync' ).mockImplementation( () => {
				throw new Error( 'EACCESS' );
			} );

			expect( () => readEnvironmentData( 'foo' ) ).toThrow(
				expect.objectContaining( {
					message: expect.stringContaining( 'There was an error reading file' ),
				} )
			);
		} );

		it( 'should throw when the file cannot be parsed', () => {
			jest.spyOn( fs, 'readFileSync' ).mockReturnValueOnce( '{' );

			expect( () => readEnvironmentData( 'foo' ) ).toThrow(
				expect.objectContaining( {
					message: expect.stringContaining( 'There was an error parsing file' ),
				} )
			);
		} );
	} );
} );
