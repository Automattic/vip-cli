/**
 * @format
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

import {
	runTestCase,
	testCases,
	formatCommandForLogging,
	preflightCheck,
} from '../../helpers/release-smoke-test.js';

// jest.mock() calls are hoisted by Jest before module imports
jest.mock( 'node:child_process', () => ( {
	spawnSync: jest.fn(),
} ) );

jest.mock( 'node:fs', () => ( {
	existsSync: jest.fn(),
	lstatSync: jest.fn(),
	mkdirSync: jest.fn(),
	mkdtempSync: jest.fn(),
	rmSync: jest.fn(),
} ) );

describe( 'release-smoke-test', () => {
	const tempRoot = path.join( path.sep, 'tmp', 'vip-cli-release-smoke-test' );
	const distBinSuffix = path.join( 'dist', 'bin' );
	const makeStats = ( { directory = false, file = false, symlink = false } = {} ) => ( {
		isDirectory: () => directory,
		isFile: () => file,
		isSymbolicLink: () => symlink,
	} );
	const distBinStats = makeStats( { directory: true } );
	const binaryStats = makeStats( { file: true } );
	const successfulSpawn = {
		status: 0,
		stdout: 'Usage:',
		stderr: '',
		error: null,
		signal: null,
	};
	const makeTestCase = ( overrides = {} ) => ( {
		name: 'test',
		bin: 'test.js',
		args: [ '--help' ],
		expectation: { exitCode: 0 },
		rationale: 'test',
		...overrides,
	} );
	const makeRootWpTestCase = ( overrides = {} ) =>
		makeTestCase( {
			bin: 'vip.js',
			requiredChildBins: [ 'vip-wp.js' ],
			args: [ 'wp', '--help' ],
			...overrides,
		} );
	const isDistBinPath = entryPath => String( entryPath ).endsWith( distBinSuffix );
	const mockBuiltDist = () => {
		existsSync.mockReturnValue( true );
		lstatSync.mockImplementation( entryPath =>
			isDistBinPath( entryPath ) ? distBinStats : binaryStats
		);
	};
	const mockSpawnSuccess = ( overrides = {} ) => {
		spawnSync.mockReturnValue( { ...successfulSpawn, ...overrides } );
	};

	beforeEach( () => {
		jest.clearAllMocks();
		mkdtempSync.mockReturnValue( tempRoot );
		mkdirSync.mockReturnValue( undefined );
		rmSync.mockReturnValue( undefined );
	} );

	describe( 'testCases validation', () => {
		it( 'should have safe flags in all test cases', () => {
			const safeFlags = [ '--help', '-h', '--version', '-v' ];
			for ( const testCase of testCases ) {
				const separatorIndex = testCase.args.indexOf( '--' );
				const argsBeforeSeparator =
					separatorIndex === -1 ? testCase.args : testCase.args.slice( 0, separatorIndex );
				const hasSafeFlag = argsBeforeSeparator.some( arg => safeFlags.includes( arg ) );
				expect( hasSafeFlag ).toBe( true );
			}
		} );

		it( 'should require vip-wp.js for the root wp dispatcher smoke case', () => {
			const rootWpTestCase = testCases.find(
				testCase => testCase.name === 'vip wp: help before separator (root dispatcher)'
			);

			expect( rootWpTestCase ).toBeDefined();
			expect( rootWpTestCase.requiredChildBins ).toEqual( [ 'vip-wp.js' ] );
		} );

		it( 'should have non-empty rationale in all test cases', () => {
			for ( const testCase of testCases ) {
				expect( testCase.rationale ).toBeDefined();
				expect( typeof testCase.rationale ).toBe( 'string' );
				expect( testCase.rationale ).not.toBe( '' );
			}
		} );
	} );

	describe( 'runTestCase validation', () => {
		describe( 'test case structure validation', () => {
			it( 'should reject null testCase', () => {
				const result = runTestCase( null );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Invalid test case: testCase must be a non-null object/ );
			} );

			it( 'should reject undefined testCase', () => {
				const result = runTestCase( undefined );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Invalid test case: testCase must be a non-null object/ );
			} );

			it( 'should reject array testCase', () => {
				const result = runTestCase( [] );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Invalid test case: testCase must be a non-null object/ );
			} );

			it( 'should reject non-string name', () => {
				const result = runTestCase( makeTestCase( { name: 123 } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Invalid test case: name must be a non-empty string/ );
			} );

			it( 'should reject empty string name', () => {
				const result = runTestCase( makeTestCase( { name: '' } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Invalid test case: name must be a non-empty string/ );
			} );

			it( 'should reject non-string bin', () => {
				const result = runTestCase( makeTestCase( { bin: 123 } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Invalid test case: bin must be a non-empty string/ );
			} );

			it( 'should reject empty string bin', () => {
				const result = runTestCase( makeTestCase( { bin: '' } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Invalid test case: bin must be a non-empty string/ );
			} );

			it( 'should reject null expectation', () => {
				const result = runTestCase( makeTestCase( { expectation: null } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Invalid test case: expectation must be a non-null object/
				);
			} );

			it( 'should reject array expectation', () => {
				const result = runTestCase( makeTestCase( { expectation: [] } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Invalid test case: expectation must be a non-null object/
				);
			} );

			it( 'should reject missing rationale', () => {
				const result = runTestCase( makeTestCase( { rationale: undefined } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Invalid test case: rationale must be a non-empty string/
				);
			} );

			it( 'should reject non-string rationale', () => {
				const result = runTestCase( makeTestCase( { rationale: 123 } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Invalid test case: rationale must be a non-empty string/
				);
			} );

			it( 'should reject empty string rationale', () => {
				const result = runTestCase( makeTestCase( { rationale: '' } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Invalid test case: rationale must be a non-empty string/
				);
			} );

			it( 'should reject non-array args', () => {
				const result = runTestCase( makeTestCase( { args: 'not-an-array' } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Invalid test case: args must be an array/ );
			} );

			it( 'should reject non-string args element', () => {
				const result = runTestCase( makeTestCase( { args: [ '--help', 123 ] } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Invalid test case: all args must be strings/ );
			} );

			it( 'should reject non-array requiredChildBins', () => {
				const result = runTestCase( makeTestCase( { requiredChildBins: 'vip-wp.js' } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Invalid test case: requiredChildBins must be an array if specified/
				);
			} );

			it( 'should reject non-string requiredChildBins element', () => {
				const result = runTestCase( makeTestCase( { requiredChildBins: [ 'vip-wp.js', 123 ] } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Invalid test case: all requiredChildBins must be non-empty strings/
				);
			} );

			it( 'should reject empty requiredChildBins element', () => {
				const result = runTestCase( makeTestCase( { requiredChildBins: [ '' ] } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Invalid test case: all requiredChildBins must be non-empty strings/
				);
			} );
		} );

		describe( 'binary path validation', () => {
			it( 'should reject bin with forward slash (path traversal)', () => {
				const result = runTestCase( makeTestCase( { bin: '../malicious/bin.js' } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Invalid test case: bin must be a basename-only file/ );
			} );

			it( 'should reject bin with backslash (Windows path traversal)', () => {
				const result = runTestCase( makeTestCase( { bin: '..\\malicious\\bin.js' } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Invalid test case: bin must be a basename-only file/ );
			} );

			it( 'should reject bin without .js extension', () => {
				const result = runTestCase( makeTestCase( { bin: 'test.txt' } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Invalid test case: bin must end with .js/ );
			} );
		} );

		describe( 'safe flag validation', () => {
			beforeEach( () => {
				mockBuiltDist();
				mockSpawnSuccess();
			} );

			it( 'should reject args without safe flag', () => {
				const result = runTestCase( makeTestCase( { args: [ '--app', '123' ] } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Invalid test case: args must include a safe flag.*to prevent live execution/
				);
			} );

			it( 'should reject safe flag after separator', () => {
				const result = runTestCase( makeTestCase( { args: [ '--', '--help' ] } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Invalid test case: args must include a safe flag.*to prevent live execution/
				);
				expect( spawnSync ).not.toHaveBeenCalled();
			} );

			it( 'should reject root wp safe flag after separator', () => {
				const result = runTestCase( makeRootWpTestCase( { args: [ 'wp', '--', '--help' ] } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Invalid test case: args must include a safe flag.*to prevent live execution/
				);
				expect( spawnSync ).not.toHaveBeenCalled();
			} );

			it( 'should accept safe flag before separator', () => {
				const result = runTestCase(
					makeTestCase( {
						args: [ '--help', '--', 'post', 'list' ],
						expectation: { exitCode: 0, stdoutIncludes: 'Usage:' },
					} )
				);
				expect( result.passed ).toBe( true );
			} );

			it( 'should accept root wp safe flag before separator', () => {
				const result = runTestCase(
					makeRootWpTestCase( {
						args: [ 'wp', '--help', '--', 'post', 'list' ],
						expectation: { exitCode: 0, stdoutIncludes: 'Usage:' },
					} )
				);
				expect( result.passed ).toBe( true );
			} );

			it( 'should accept --help as safe flag', () => {
				const result = runTestCase( makeTestCase() );
				expect( result.passed ).toBe( true );
			} );

			it( 'should accept -h as safe flag', () => {
				const result = runTestCase( makeTestCase( { args: [ '-h' ] } ) );
				expect( result.passed ).toBe( true );
			} );

			it( 'should accept --version as safe flag', () => {
				const result = runTestCase( makeTestCase( { args: [ '--version' ] } ) );
				expect( result.passed ).toBe( true );
			} );

			it( 'should accept -v as safe flag', () => {
				const result = runTestCase( makeTestCase( { args: [ '-v' ] } ) );
				expect( result.passed ).toBe( true );
			} );
		} );

		describe( 'expectation field validation', () => {
			beforeEach( () => {
				mockBuiltDist();
				mockSpawnSuccess();
			} );

			it( 'should reject empty string stdoutIncludes', () => {
				const result = runTestCase(
					makeTestCase( { expectation: { exitCode: 0, stdoutIncludes: '' } } )
				);
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Invalid test case: stdoutIncludes must be a non-empty string if specified/
				);
			} );

			it( 'should reject non-string stdoutIncludes', () => {
				const result = runTestCase(
					makeTestCase( { expectation: { exitCode: 0, stdoutIncludes: 123 } } )
				);
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Invalid test case: stdoutIncludes must be a non-empty string if specified/
				);
			} );

			it( 'should reject empty string stderrIncludes', () => {
				const result = runTestCase(
					makeTestCase( { expectation: { exitCode: 0, stderrIncludes: '' } } )
				);
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Invalid test case: stderrIncludes must be a non-empty string if specified/
				);
			} );

			it( 'should reject non-string stderrIncludes', () => {
				const result = runTestCase(
					makeTestCase( { expectation: { exitCode: 0, stderrIncludes: 123 } } )
				);
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Invalid test case: stderrIncludes must be a non-empty string if specified/
				);
			} );

			it( 'should reject string exitCode', () => {
				const result = runTestCase( makeTestCase( { expectation: { exitCode: '0' } } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Invalid test case: exitCode must be an integer if specified/
				);
			} );

			it( 'should reject float exitCode', () => {
				const result = runTestCase( makeTestCase( { expectation: { exitCode: 1.5 } } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Invalid test case: exitCode must be an integer if specified/
				);
			} );
		} );

		describe( 'binary file system validation', () => {
			beforeEach( () => {
				mockBuiltDist();
			} );

			it( 'should reject symlinked dist/bin before checking binaries', () => {
				lstatSync.mockImplementation( entryPath =>
					isDistBinPath( entryPath ) ? makeStats( { directory: true, symlink: true } ) : binaryStats
				);

				const result = runTestCase( makeTestCase() );

				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/dist\/bin directory path is a symlink \(rejected for security\)/
				);
				expect( spawnSync ).not.toHaveBeenCalled();
			} );

			it( 'should reject non-directory dist/bin before checking binaries', () => {
				lstatSync.mockImplementation( entryPath =>
					isDistBinPath( entryPath ) ? makeStats( { file: true } ) : binaryStats
				);

				const result = runTestCase( makeTestCase() );

				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /dist\/bin directory path exists but is not a directory/ );
				expect( spawnSync ).not.toHaveBeenCalled();
			} );

			it( 'should use the shared dist/bin validation in preflightCheck', () => {
				lstatSync.mockImplementation( entryPath =>
					isDistBinPath( entryPath ) ? makeStats( { directory: true, symlink: true } ) : binaryStats
				);
				const consoleError = jest.spyOn( console, 'error' ).mockImplementation( () => {} );

				try {
					expect( preflightCheck() ).toBe( false );
				} finally {
					consoleError.mockRestore();
				}
			} );

			it( 'should reject non-existent binary', () => {
				existsSync.mockImplementation( entryPath => isDistBinPath( entryPath ) );

				const result = runTestCase( makeTestCase() );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Binary not found.*Run 'npm run build' first/ );
			} );

			it( 'should reject binary that is a symlink', () => {
				lstatSync.mockImplementation( entryPath =>
					isDistBinPath( entryPath ) ? distBinStats : makeStats( { file: true, symlink: true } )
				);

				const result = runTestCase( makeTestCase() );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Binary path is a symlink \(rejected for security\)/ );
			} );

			it( 'should reject binary that is not a regular file', () => {
				lstatSync.mockImplementation( entryPath =>
					isDistBinPath( entryPath ) ? distBinStats : makeStats()
				);

				const result = runTestCase( makeTestCase() );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Binary path exists but is not a regular file/ );
			} );

			it( 'should handle lstatSync errors', () => {
				lstatSync.mockImplementation( entryPath => {
					if ( isDistBinPath( entryPath ) ) {
						return distBinStats;
					}

					throw new Error( 'Permission denied' );
				} );

				const result = runTestCase( makeTestCase() );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Failed to stat binary: Permission denied/ );
			} );

			it( 'should reject non-existent required child binary before spawning', () => {
				existsSync.mockImplementation( binPath => ! String( binPath ).endsWith( 'vip-wp.js' ) );
				lstatSync.mockImplementation( entryPath =>
					isDistBinPath( entryPath ) ? distBinStats : binaryStats
				);

				const result = runTestCase( makeRootWpTestCase() );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Required child binary not found.*vip-wp\.js/ );
				expect( spawnSync ).not.toHaveBeenCalled();
			} );

			it( 'should reject required child binary with forward slash', () => {
				const result = runTestCase(
					makeRootWpTestCase( { requiredChildBins: [ '../vip-wp.js' ] } )
				);
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Invalid test case: required child bin must be a basename-only file/
				);
				expect( spawnSync ).not.toHaveBeenCalled();
			} );

			it( 'should reject required child binary with backslash', () => {
				const result = runTestCase(
					makeRootWpTestCase( { requiredChildBins: [ '..\\vip-wp.js' ] } )
				);
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Invalid test case: required child bin must be a basename-only file/
				);
				expect( spawnSync ).not.toHaveBeenCalled();
			} );

			it( 'should reject required child binary without .js extension', () => {
				const result = runTestCase( makeRootWpTestCase( { requiredChildBins: [ 'vip-wp.txt' ] } ) );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Invalid test case: required child bin must end with \.js/
				);
				expect( spawnSync ).not.toHaveBeenCalled();
			} );

			it( 'should reject required child binary that is a symlink', () => {
				lstatSync.mockImplementation( binPath => ( {
					isDirectory: () => isDistBinPath( binPath ),
					isSymbolicLink: () => String( binPath ).endsWith( 'vip-wp.js' ),
					isFile: () => ! isDistBinPath( binPath ),
				} ) );

				const result = runTestCase( makeRootWpTestCase() );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Required child binary path is a symlink/ );
				expect( spawnSync ).not.toHaveBeenCalled();
			} );

			it( 'should reject required child binary that is not a regular file', () => {
				lstatSync.mockImplementation( binPath => ( {
					isDirectory: () => isDistBinPath( binPath ),
					isSymbolicLink: () => false,
					isFile: () => ! isDistBinPath( binPath ) && ! String( binPath ).endsWith( 'vip-wp.js' ),
				} ) );

				const result = runTestCase( makeRootWpTestCase() );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Required child binary path exists but is not a regular file/
				);
				expect( spawnSync ).not.toHaveBeenCalled();
			} );

			it( 'should handle required child binary lstatSync errors', () => {
				lstatSync.mockImplementation( binPath => {
					if ( isDistBinPath( binPath ) ) {
						return distBinStats;
					}

					if ( String( binPath ).endsWith( 'vip-wp.js' ) ) {
						throw new Error( 'Permission denied' );
					}

					return binaryStats;
				} );

				const result = runTestCase( makeRootWpTestCase() );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Failed to stat required child binary: Permission denied/
				);
				expect( spawnSync ).not.toHaveBeenCalled();
			} );
		} );

		describe( 'spawn execution', () => {
			beforeEach( () => {
				mockBuiltDist();
			} );

			it( 'should return a structured failure when temp root creation fails', () => {
				mkdtempSync.mockImplementation( () => {
					throw new Error( 'temp root denied' );
				} );

				const result = runTestCase( makeTestCase() );

				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Failed to create credential scope: temp root denied/ );
				expect( spawnSync ).not.toHaveBeenCalled();
				expect( rmSync ).not.toHaveBeenCalled();
			} );

			it( 'should roll back a temp root when credential child directory creation fails', () => {
				mkdirSync.mockImplementation( dirPath => {
					if ( dirPath === path.join( tempRoot, 'appdata' ) ) {
						throw new Error( 'appdata denied' );
					}

					return undefined;
				} );

				const result = runTestCase( makeTestCase() );

				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Failed to create credential scope: appdata denied/ );
				expect( rmSync ).toHaveBeenCalledWith( tempRoot, { recursive: true, force: true } );
				expect( spawnSync ).not.toHaveBeenCalled();
			} );

			it( 'should call spawnSync with nodeExec, shell:false, and isolated env', () => {
				const originalEnv = process.env;
				process.env = {
					...process.env,
					HOME: path.join( path.sep, 'real-home' ),
					USERPROFILE: path.join( path.sep, 'real-profile' ),
					APPDATA: path.join( path.sep, 'real-appdata' ),
					LOCALAPPDATA: path.join( path.sep, 'real-localappdata' ),
					XDG_CONFIG_HOME: path.join( path.sep, 'real-config' ),
					TMP: path.join( path.sep, 'real-tmp' ),
					TEMP: path.join( path.sep, 'real-temp' ),
				};

				try {
					mockSpawnSuccess();

					runTestCase( makeTestCase() );

					const [ , argv, spawnOptions ] = spawnSync.mock.calls[ 0 ];
					expect( argv ).toEqual( [
						expect.stringContaining( path.join( 'dist', 'bin', 'test.js' ) ),
						'--help',
					] );
					expect( spawnOptions ).toEqual(
						expect.objectContaining( {
							shell: false,
							env: expect.objectContaining( {
								NODE_ENV: 'test',
								DO_NOT_TRACK: '1',
								CI: 'true',
								HOME: path.join( tempRoot, 'home' ),
								USERPROFILE: path.join( tempRoot, 'home' ),
								APPDATA: path.join( tempRoot, 'appdata' ),
								LOCALAPPDATA: path.join( tempRoot, 'localappdata' ),
								XDG_CONFIG_HOME: path.join( tempRoot, 'xdg-config' ),
								TMP: path.join( tempRoot, 'tmp' ),
								TEMP: path.join( tempRoot, 'tmp' ),
							} ),
							timeout: expect.any( Number ),
							encoding: 'utf8',
						} )
					);
					expect( spawnOptions.env.HOME ).not.toBe( process.env.HOME );
					expect( spawnOptions.env.USERPROFILE ).not.toBe( process.env.USERPROFILE );
					expect( spawnOptions.env.APPDATA ).not.toBe( process.env.APPDATA );
					expect( spawnOptions.env ).not.toHaveProperty(
						'XDG_CONFIG_HOME',
						process.env.XDG_CONFIG_HOME
					);
					expect( mkdirSync ).toHaveBeenCalledWith( path.join( tempRoot, 'home' ), {
						recursive: true,
					} );
					expect( rmSync ).toHaveBeenCalledWith( tempRoot, { recursive: true, force: true } );
				} finally {
					process.env = originalEnv;
				}

				expect( spawnSync ).toHaveBeenCalledWith(
					process.execPath,
					expect.any( Array ),
					expect.any( Object )
				);
			} );

			it( 'should not forward WPVIP_DEPLOY_TOKEN or NPM_TOKEN to the child process', () => {
				const originalEnv = process.env;
				process.env = {
					...process.env,
					WPVIP_DEPLOY_TOKEN: 'should-not-leak',
					NPM_TOKEN: 'should-not-leak',
					npm_config_token: 'should-not-leak',
				};

				try {
					mockSpawnSuccess();

					runTestCase( makeTestCase() );

					const [ , , spawnOptions ] = spawnSync.mock.calls[ 0 ];
					expect( spawnOptions.env ).not.toHaveProperty( 'WPVIP_DEPLOY_TOKEN' );
					expect( spawnOptions.env ).not.toHaveProperty( 'NPM_TOKEN' );
					expect( spawnOptions.env ).not.toHaveProperty( 'npm_config_token' );
				} finally {
					process.env = originalEnv;
				}
			} );

			it( 'should surface cleanup failure after a passing smoke test', () => {
				mockSpawnSuccess();
				rmSync.mockImplementation( () => {
					throw new Error( 'cleanup denied' );
				} );

				const result = runTestCase( makeTestCase() );

				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Failed to cleanup credential scope: cleanup denied/ );
			} );

			it( 'should keep the smoke failure result when cleanup also fails', () => {
				mockSpawnSuccess( { status: 1 } );
				rmSync.mockImplementation( () => {
					throw new Error( 'cleanup denied' );
				} );

				const result = runTestCase( makeTestCase() );

				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Exit code 1, expected 0/ );
			} );

			it( 'should pass when binary exists and spawn succeeds with expected output', () => {
				spawnSync.mockReturnValue( {
					status: 0,
					stdout: 'Usage: test.js [options]',
					stderr: '',
					error: null,
					signal: null,
				} );

				const result = runTestCase(
					makeTestCase( { expectation: { exitCode: 0, stdoutIncludes: 'Usage:' } } )
				);
				expect( result.passed ).toBe( true );
				expect( result.detail ).toBe( 'PASS' );
			} );

			it( 'should fail when exit code does not match expectation', () => {
				spawnSync.mockReturnValue( {
					status: 1,
					stdout: '',
					stderr: 'Error',
					error: null,
					signal: null,
				} );

				const result = runTestCase( makeTestCase() );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Exit code 1, expected 0/ );
			} );

			it( 'should fail when stdout does not include expected text', () => {
				spawnSync.mockReturnValue( {
					status: 0,
					stdout: 'Different text',
					stderr: '',
					error: null,
					signal: null,
				} );

				const result = runTestCase(
					makeTestCase( { expectation: { exitCode: 0, stdoutIncludes: 'Usage:' } } )
				);
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Stdout missing expected text: "Usage:"/ );
			} );

			it( 'should fail when stderr does not include expected text', () => {
				spawnSync.mockReturnValue( {
					status: 1,
					stdout: '',
					stderr: 'Different error',
					error: null,
					signal: null,
				} );

				const result = runTestCase(
					makeTestCase( { expectation: { exitCode: 1, stderrIncludes: 'Expected error' } } )
				);
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Stderr missing expected text: "Expected error"/ );
			} );

			it( 'should handle timeout errors', () => {
				spawnSync.mockReturnValue( {
					status: null,
					stdout: '',
					stderr: '',
					error: { code: 'ETIMEDOUT', message: 'Timeout' },
					signal: null,
				} );

				const result = runTestCase( makeTestCase() );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Timeout after \d+ms/ );
			} );

			it( 'should handle spawn errors', () => {
				spawnSync.mockReturnValue( {
					status: null,
					stdout: '',
					stderr: '',
					error: { message: 'ENOENT: no such file or directory' },
					signal: null,
				} );

				const result = runTestCase( makeTestCase() );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Spawn error: ENOENT: no such file or directory/ );
			} );

			it( 'should handle process killed by signal', () => {
				spawnSync.mockReturnValue( {
					status: null,
					stdout: '',
					stderr: '',
					error: null,
					signal: 'SIGTERM',
				} );

				const result = runTestCase( makeTestCase() );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch( /Process killed by signal: SIGTERM/ );
			} );

			it( 'should handle null status', () => {
				spawnSync.mockReturnValue( {
					status: null,
					stdout: '',
					stderr: '',
					error: null,
					signal: null,
				} );

				const result = runTestCase( makeTestCase() );
				expect( result.passed ).toBe( false );
				expect( result.detail ).toMatch(
					/Process exit status is null \(process may have failed to start\)/
				);
			} );

			it( 'should default to exit code 0 when not specified', () => {
				spawnSync.mockReturnValue( {
					status: 0,
					stdout: 'Usage:',
					stderr: '',
					error: null,
					signal: null,
				} );

				const result = runTestCase( makeTestCase( { expectation: {} } ) );
				expect( result.passed ).toBe( true );
				expect( result.detail ).toBe( 'PASS' );
			} );

			it( 'should pass when non-zero exit code matches expectation', () => {
				spawnSync.mockReturnValue( {
					status: 1,
					stdout: '',
					stderr: 'Error message',
					error: null,
					signal: null,
				} );

				const result = runTestCase(
					makeTestCase( { expectation: { exitCode: 1, stderrIncludes: 'Error' } } )
				);
				expect( result.passed ).toBe( true );
				expect( result.detail ).toBe( 'PASS' );
			} );
		} );
	} );

	describe( 'formatCommandForLogging', () => {
		describe( 'credential redaction', () => {
			it( 'should redact --token values', () => {
				const result = formatCommandForLogging( 'test.js', [ '--token=mysecret' ] );
				expect( result ).toBe( 'node test.js --token=[REDACTED]' );
				expect( result ).not.toContain( 'mysecret' );
			} );

			it( 'should redact --password values', () => {
				const result = formatCommandForLogging( 'test.js', [ '--password=mypass' ] );
				expect( result ).toBe( 'node test.js --password=[REDACTED]' );
				expect( result ).not.toContain( 'mypass' );
			} );

			it( 'should redact --secret values', () => {
				const result = formatCommandForLogging( 'test.js', [ '--secret=sensitive' ] );
				expect( result ).toBe( 'node test.js --secret=[REDACTED]' );
				expect( result ).not.toContain( 'sensitive' );
			} );

			it( 'should redact --key values', () => {
				const result = formatCommandForLogging( 'test.js', [ '--key=apikey123' ] );
				expect( result ).toBe( 'node test.js --key=[REDACTED]' );
				expect( result ).not.toContain( 'apikey123' );
			} );

			it( 'should redact --authorization values', () => {
				const result = formatCommandForLogging( 'test.js', [ '--authorization=Bearer xyz' ] );
				expect( result ).toBe( 'node test.js --authorization=[REDACTED]' );
				expect( result ).not.toContain( 'Bearer' );
				expect( result ).not.toContain( 'xyz' );
			} );

			it( 'should redact --cookie values', () => {
				const result = formatCommandForLogging( 'test.js', [ '--cookie=session=abc' ] );
				expect( result ).toBe( 'node test.js --cookie=[REDACTED]' );
				expect( result ).not.toContain( 'session' );
				expect( result ).not.toContain( 'abc' );
			} );

			it( 'should be case-insensitive for credential patterns', () => {
				const result = formatCommandForLogging( 'test.js', [
					'--TOKEN=secret',
					'--Password=pass',
					'--SECRET=value',
				] );
				expect( result ).toBe(
					'node test.js --TOKEN=[REDACTED] --Password=[REDACTED] --SECRET=[REDACTED]'
				);
				expect( result ).not.toContain( 'secret' );
				expect( result ).not.toContain( 'pass' );
				expect( result ).not.toContain( 'value' );
			} );

			it( 'should redact separate credential values for all credential flags', () => {
				const result = formatCommandForLogging( 'test.js', [
					'--token',
					'secret1',
					'--password',
					'secret2',
					'--secret',
					'secret3',
					'--key',
					'secret4',
					'--authorization',
					'Bearer xyz',
					'--cookie',
					'session=abc',
				] );
				expect( result ).toBe(
					'node test.js --token [REDACTED] --password [REDACTED] --secret [REDACTED] --key [REDACTED] --authorization [REDACTED] --cookie [REDACTED]'
				);
				expect( result ).not.toContain( 'secret1' );
				expect( result ).not.toContain( 'secret2' );
				expect( result ).not.toContain( 'secret3' );
				expect( result ).not.toContain( 'secret4' );
				expect( result ).not.toContain( 'Bearer' );
				expect( result ).not.toContain( 'xyz' );
				expect( result ).not.toContain( 'session' );
				expect( result ).not.toContain( 'abc' );
			} );

			it( 'should be case-insensitive for separate credential flags', () => {
				const result = formatCommandForLogging( 'test.js', [
					'--TOKEN',
					'secret',
					'--Password',
					'pass',
				] );
				expect( result ).toBe( 'node test.js --TOKEN [REDACTED] --Password [REDACTED]' );
				expect( result ).not.toContain( 'secret' );
				expect( result ).not.toContain( 'pass' );
			} );

			it( 'should process adjacent credential flags without leaking the later split value', () => {
				const result = formatCommandForLogging( 'test.js', [ '--token', '--password', 'secret' ] );
				expect( result ).toBe( 'node test.js --token --password [REDACTED]' );
				expect( result ).not.toContain( 'secret' );
			} );

			it( 'should process mixed-case adjacent credential flags without leaking the later split value', () => {
				const result = formatCommandForLogging( 'test.js', [ '--ToKeN', '--PaSsWoRd', 'secret' ] );
				expect( result ).toBe( 'node test.js --ToKeN --PaSsWoRd [REDACTED]' );
				expect( result ).not.toContain( 'secret' );
			} );

			it( 'should redact flag-like separate credential values', () => {
				const result = formatCommandForLogging( 'test.js', [ '--token', '--help' ] );
				expect( result ).toBe( 'node test.js --token [REDACTED]' );
			} );

			it( 'should preserve final credential flags when separate values are missing', () => {
				const result = formatCommandForLogging( 'test.js', [ '--help', '--token' ] );
				expect( result ).toBe( 'node test.js --help --token' );
			} );

			it( 'should redact non-string separate credential values', () => {
				const result = formatCommandForLogging( 'test.js', [ '--token', 123, '--help' ] );
				expect( result ).toBe( 'node test.js --token [REDACTED] --help' );
			} );
		} );

		describe( 'non-credential args', () => {
			it( 'should pass through non-credential args', () => {
				const result = formatCommandForLogging( 'test.js', [
					'--help',
					'--app',
					'123',
					'--env',
					'456',
				] );
				expect( result ).toBe( 'node test.js --help --app 123 --env 456' );
			} );

			it( 'should pass through flag-like args without values', () => {
				const result = formatCommandForLogging( 'test.js', [ '--help', '--version', '--debug' ] );
				expect( result ).toBe( 'node test.js --help --version --debug' );
			} );

			it( 'should pass through positional args', () => {
				const result = formatCommandForLogging( 'test.js', [ 'wp', 'post', 'list' ] );
				expect( result ).toBe( 'node test.js wp post list' );
			} );
		} );

		describe( 'mixed args', () => {
			it( 'should redact credentials and pass through other args', () => {
				const result = formatCommandForLogging( 'test.js', [
					'--app',
					'123',
					'--token=secret',
					'--help',
				] );
				expect( result ).toBe( 'node test.js --app 123 --token=[REDACTED] --help' );
				expect( result ).not.toContain( 'secret' );
			} );

			it( 'should preserve ordinary argument ordering around separate credential values', () => {
				const result = formatCommandForLogging( 'test.js', [
					'--app',
					'123',
					'--token',
					'secret',
					'wp',
					'--env',
					'456',
					'--password',
					'bravoCredential',
					'--help',
				] );
				expect( result ).toBe(
					'node test.js --app 123 --token [REDACTED] wp --env 456 --password [REDACTED] --help'
				);
				expect( result ).not.toContain( 'secret' );
				expect( result ).not.toContain( 'bravoCredential' );
			} );
		} );

		describe( 'invalid args handling', () => {
			it( 'should return error marker when args is not an array', () => {
				const result = formatCommandForLogging( 'test.js', 'not-an-array' );
				expect( result ).toBe( 'node test.js [invalid args: string]' );
			} );

			it( 'should return error marker when args is null', () => {
				const result = formatCommandForLogging( 'test.js', null );
				expect( result ).toBe( 'node test.js [invalid args: object]' );
			} );

			it( 'should return error marker when args is undefined', () => {
				const result = formatCommandForLogging( 'test.js', undefined );
				expect( result ).toBe( 'node test.js [invalid args: undefined]' );
			} );

			it( 'should handle non-string arg types', () => {
				const result = formatCommandForLogging( 'test.js', [ '--help', 123, true, null ] );
				expect( result ).toBe(
					'node test.js --help [invalid arg type: number] [invalid arg type: boolean] [invalid arg type: object]'
				);
			} );
		} );

		describe( 'edge cases', () => {
			it( 'should handle empty args array', () => {
				const result = formatCommandForLogging( 'test.js', [] );
				expect( result ).toBe( 'node test.js ' );
			} );

			it( 'should handle credential flags with empty values', () => {
				const result = formatCommandForLogging( 'test.js', [ '--token=' ] );
				expect( result ).toBe( 'node test.js --token=[REDACTED]' );
			} );

			it( 'should handle multiple credential flags', () => {
				const result = formatCommandForLogging( 'test.js', [
					'--token=secret1',
					'--password=secret2',
					'--key=secret3',
				] );
				expect( result ).toBe(
					'node test.js --token=[REDACTED] --password=[REDACTED] --key=[REDACTED]'
				);
				expect( result ).not.toContain( 'secret1' );
				expect( result ).not.toContain( 'secret2' );
				expect( result ).not.toContain( 'secret3' );
			} );
		} );
	} );
} );
