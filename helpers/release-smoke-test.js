#!/usr/bin/env node

/**
 * Release Smoke Test Script
 *
 * Tests high-risk CLI parser/dispatch commands against built dist/bin binaries
 * to catch regressions in option parsing, short-option equals syntax, and
 * command routing before release.
 *
 * All tests are credential-free and use --help or other non-executing forms.
 * Requires: npm run build (to generate dist/bin/*.js)
 *
 * Exit: 0 if all pass, non-zero if any fail
 */

const { spawnSync } = require( 'node:child_process' );
const { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync } = require( 'node:fs' );
const { tmpdir } = require( 'node:os' );
const path = require( 'node:path' );

const projectRoot = path.resolve( __dirname, '..' );
const distBinDir = path.join( projectRoot, 'dist', 'bin' );
const nodeExec = process.execPath;

// Timeout for each test case (ms)
const TIMEOUT_MS = 5000;

const runtimeEnvKeys = [ 'PATH', 'SystemRoot', 'WINDIR', 'PATHEXT', 'COMSPEC' ];
const helpExpectation = {
	exitCode: 0,
	stdoutIncludes: 'Usage:',
};

/**
 * Test result shape returned by validation and test functions
 * @typedef {Object} TestResult
 * @property {boolean} passed - Whether the validation or test passed
 * @property {string} detail - Details of the result (error message or pass confirmation)
 */

/**
 * Test case definition
 * @typedef {Object} TestCase
 * @property {string} name - Human-readable test name
 * @property {string} bin - Binary name (e.g., 'vip-logs.js')
 * @property {string[]} [requiredChildBins] - Built child binaries that must be present before this case can run
 * @property {string[]} args - Argument array (no shell interpolation)
 * @property {Object} expectation - Expected outcome
 * @property {number} [expectation.exitCode] - Expected exit code (default: 0)
 * @property {string} [expectation.stdoutIncludes] - String that should appear in stdout
 * @property {string} [expectation.stderrIncludes] - String that should appear in stderr
 * @property {string} rationale - Why this test is safe and credential-free
 */

/**
 * @type {TestCase[]}
 */
const testCases = [
	// FR-2: vip logs high-risk shapes
	{
		name: 'vip logs: short-option equals syntax (-l=10)',
		bin: 'vip-logs.js',
		args: [ '-l=10', '--help' ],
		expectation: helpExpectation,
		rationale: 'Tests short-option equals parsing for -l (limit). --help prevents API calls/auth.',
	},
	{
		name: 'vip logs: explicit default value match (--limit=500)',
		bin: 'vip-logs.js',
		args: [ '--limit=500', '--help' ],
		expectation: helpExpectation,
		rationale:
			'Tests explicit default value parsing. --help prevents API calls/auth; no credentials needed.',
	},
	{
		name: 'vip logs: type option short syntax (-t=batch)',
		bin: 'vip-logs.js',
		args: [ '-t=batch', '--help' ],
		expectation: helpExpectation,
		rationale: 'Tests short-option equals for -t (type). --help is safe and non-executing.',
	},

	// FR-3: vip slowlogs high-risk shapes
	{
		name: 'vip slowlogs: short-option equals syntax (-l=50)',
		bin: 'vip-slowlogs.js',
		args: [ '-l=50', '--help' ],
		expectation: helpExpectation,
		rationale: 'Tests short-option equals parsing for -l (limit). --help prevents API calls/auth.',
	},
	{
		name: 'vip slowlogs: explicit default value match (--limit=500)',
		bin: 'vip-slowlogs.js',
		args: [ '--limit=500', '--help' ],
		expectation: helpExpectation,
		rationale:
			'Tests explicit default value parsing. --help prevents API calls/auth; no credentials needed.',
	},
	{
		name: 'vip slowlogs: format option short syntax (-f=json)',
		bin: 'vip-slowlogs.js',
		args: [ '-f=json', '--help' ],
		expectation: helpExpectation,
		rationale: 'Tests short-option equals for -f (format). --help is safe and non-executing.',
	},

	// FR-4: vip wp option-only and separator/subcommand shapes
	{
		name: 'vip wp: option-only help',
		bin: 'vip-wp.js',
		args: [ '--help' ],
		expectation: helpExpectation,
		rationale: 'Tests option-only path. --help bypasses auth/API/browser prompts.',
	},
	{
		name: 'vip wp: yes option parsing',
		bin: 'vip-wp.js',
		args: [ '--yes', '--help' ],
		expectation: helpExpectation,
		rationale: 'Tests yes option parsing. --help prevents execution; credential-free.',
	},
	{
		name: 'vip wp: help before separator (child parser)',
		bin: 'vip-wp.js',
		args: [ '--help', '--', 'option', 'get', 'home' ],
		expectation: helpExpectation,
		rationale:
			'Tests separator/subcommand parsing. --help before separator prevents execution; credential-free.',
	},
	{
		name: 'vip wp: help before separator (root dispatcher)',
		bin: 'vip.js',
		requiredChildBins: [ 'vip-wp.js' ],
		args: [ 'wp', '--help', '--', 'option', 'get', 'home' ],
		expectation: helpExpectation,
		rationale:
			'Tests root dispatcher with separator/subcommand. --help before separator prevents execution; credential-free.',
	},
	{
		name: 'vip wp: missing separator guard (expected failure)',
		bin: 'vip.js',
		args: [ 'wp', 'post', 'list', '--help' ],
		expectation: {
			exitCode: 1,
			stderrIncludes: 'A double dash',
		},
		rationale:
			'Tests separator guard without app/env context. Expected to fail with separator error; credential-free.',
	},

	// FR-5: vip dev-env shell parent option/dispatch
	{
		name: 'vip dev-env shell: help without env creation',
		bin: 'vip-dev-env-shell.js',
		args: [ '--help' ],
		expectation: helpExpectation,
		rationale: 'Tests parent command option parsing. --help prevents Docker/Lando/env creation.',
	},
	{
		name: 'vip dev-env shell: slug option with help',
		bin: 'vip-dev-env-shell.js',
		args: [ '--slug=test-env', '--help' ],
		expectation: helpExpectation,
		rationale:
			'Tests slug option parsing. --help prevents env lookup/creation; no Docker/Lando needed.',
	},
	{
		name: 'vip dev-env shell: root option with help',
		bin: 'vip-dev-env-shell.js',
		args: [ '--root', '--help' ],
		expectation: helpExpectation,
		rationale: 'Tests boolean root option. --help prevents shell creation; safe without Docker.',
	},
];

/**
 * Extract error message from unknown caught value
 * @param {unknown} err - The caught value
 * @return {string} - Error message
 */
function getErrorMessage( err ) {
	if ( err instanceof Error ) {
		return err.message;
	}
	if ( typeof err === 'object' && err !== null && 'message' in err ) {
		const errWithMessage = /** @type {{ message: unknown }} */ ( err );
		if ( typeof errWithMessage.message === 'string' ) {
			return errWithMessage.message;
		}
	}
	return String( err );
}

/**
 * Copy only runtime variables required for process startup.
 * @return {Object<string,string>}
 */
function getRuntimeEnv() {
	return runtimeEnvKeys.reduce( ( env, key ) => {
		if ( process.env[ key ] !== undefined ) {
			env[ key ] = process.env[ key ];
		}

		return env;
	}, {} );
}

/**
 * Create isolated home/profile/config directories for a single smoke test process.
 * @return {{ root: string, env: Object<string,string> }}
 */
function createCredentialScope() {
	let root;

	try {
		root = mkdtempSync( path.join( tmpdir(), 'vip-cli-release-smoke-' ) );
		const home = path.join( root, 'home' );
		const appData = path.join( root, 'appdata' );
		const localAppData = path.join( root, 'localappdata' );
		const config = path.join( root, 'xdg-config' );
		const temp = path.join( root, 'tmp' );

		for ( const dirPath of [ home, appData, localAppData, config, temp ] ) {
			mkdirSync( dirPath, { recursive: true } );
		}

		return {
			root,
			env: {
				...getRuntimeEnv(),
				HOME: home,
				USERPROFILE: home,
				APPDATA: appData,
				LOCALAPPDATA: localAppData,
				XDG_CONFIG_HOME: config,
				TMP: temp,
				TEMP: temp,
				NODE_ENV: 'test',
				DO_NOT_TRACK: '1',
				CI: 'true',
			},
		};
	} catch ( err ) {
		if ( root ) {
			try {
				cleanupCredentialScope( root );
			} catch ( cleanupErr ) {
				throw new Error(
					`${ getErrorMessage( err ) }; cleanup failed: ${ getErrorMessage( cleanupErr ) }`
				);
			}
		}

		throw err;
	}
}

/**
 * Remove isolated credential directories.
 * @param {string} root
 */
function cleanupCredentialScope( root ) {
	rmSync( root, { recursive: true, force: true } );
}

/**
 * Format command string for logging without assuming args is an array
 * @param {string} bin
 * @param {*} args
 * @return {string}
 */
function formatCommandForLogging( bin, args ) {
	if ( ! Array.isArray( args ) ) {
		return `node ${ bin } [invalid args: ${ typeof args }]`;
	}
	const credentialFlagNames = new Set( [
		'--token',
		'--password',
		'--secret',
		'--key',
		'--authorization',
		'--cookie',
	] );
	const isCredentialFlagArg = arg => {
		if ( typeof arg !== 'string' ) {
			return false;
		}

		const equalsIndex = arg.indexOf( '=' );
		const flagName = equalsIndex === -1 ? arg : arg.slice( 0, equalsIndex );
		return credentialFlagNames.has( flagName.toLowerCase() );
	};
	const formattedArgs = [];

	for ( let index = 0; index < args.length; index++ ) {
		const arg = args[ index ];
		if ( typeof arg !== 'string' ) {
			formattedArgs.push( `[invalid arg type: ${ typeof arg }]` );
			continue;
		}

		const equalsIndex = arg.indexOf( '=' );
		const flagName = equalsIndex === -1 ? arg : arg.slice( 0, equalsIndex );
		const isCredentialFlag = credentialFlagNames.has( flagName.toLowerCase() );
		if ( isCredentialFlag && equalsIndex !== -1 ) {
			formattedArgs.push( `${ flagName }=[REDACTED]` );
			continue;
		}

		formattedArgs.push( arg );
		if ( isCredentialFlag && index + 1 < args.length ) {
			// If the next token is itself a credential flag name (e.g. --token --password secret),
			// we treat --token's position as a bare flag (no value to redact) and let --password
			// be handled in the next iteration. This means the bare --token remains unredacted.
			// In practice, valid tokens are never named after credential flags.
			if ( isCredentialFlagArg( args[ index + 1 ] ) ) {
				continue;
			}

			formattedArgs.push( '[REDACTED]' );
			index++;
		}
	}

	const argsStr = formattedArgs.join( ' ' );
	return `node ${ bin } ${ argsStr }`;
}

/**
 * Validate basic test case structure and required fields
 * @param {*} testCase
 * @return {TestResult|null} error result or null if valid
 */
function validateTestCaseStructure( testCase ) {
	// Guard: testCase must be a non-null object (not an array)
	if ( ! testCase || typeof testCase !== 'object' || Array.isArray( testCase ) ) {
		return {
			passed: false,
			detail: 'Invalid test case: testCase must be a non-null object',
		};
	}

	// Validate name is a non-empty string
	if ( typeof testCase.name !== 'string' || testCase.name === '' ) {
		return {
			passed: false,
			detail: 'Invalid test case: name must be a non-empty string',
		};
	}

	// Validate bin is a non-empty string
	if ( typeof testCase.bin !== 'string' || ! testCase.bin ) {
		return {
			passed: false,
			detail: 'Invalid test case: bin must be a non-empty string',
		};
	}

	// Validate expectation exists and is an object
	if (
		! testCase.expectation ||
		typeof testCase.expectation !== 'object' ||
		Array.isArray( testCase.expectation )
	) {
		return {
			passed: false,
			detail: 'Invalid test case: expectation must be a non-null object',
		};
	}

	// Validate rationale is a non-empty string
	if ( typeof testCase.rationale !== 'string' || testCase.rationale === '' ) {
		return {
			passed: false,
			detail: 'Invalid test case: rationale must be a non-empty string',
		};
	}

	// Validate args is an array of strings
	if ( ! Array.isArray( testCase.args ) ) {
		return {
			passed: false,
			detail: 'Invalid test case: args must be an array',
		};
	}

	for ( const arg of testCase.args ) {
		if ( typeof arg !== 'string' ) {
			return {
				passed: false,
				detail: `Invalid test case: all args must be strings, got: ${ typeof arg }`,
			};
		}
	}

	const childBinsError = validateRequiredChildBinsStructure( testCase.requiredChildBins );
	if ( childBinsError ) {
		return childBinsError;
	}

	return null;
}

/**
 * Validate optional required child binary field shape
 * @param {*} requiredChildBins
 * @return {TestResult|null} error result or null if valid
 */
function validateRequiredChildBinsStructure( requiredChildBins ) {
	if ( requiredChildBins === undefined ) {
		return null;
	}

	if ( ! Array.isArray( requiredChildBins ) ) {
		return {
			passed: false,
			detail: 'Invalid test case: requiredChildBins must be an array if specified',
		};
	}

	for ( const childBin of requiredChildBins ) {
		if ( typeof childBin !== 'string' || childBin === '' ) {
			return {
				passed: false,
				detail: 'Invalid test case: all requiredChildBins must be non-empty strings',
			};
		}
	}

	return null;
}

/**
 * Validate binary path rules (basename only, .js extension)
 * @param {string} bin
 * @return {TestResult|null} error result or null if valid
 */
function validateBinaryPathRules( bin ) {
	// Validate bin is a basename-only .js file (no path separators)
	if ( bin.includes( '/' ) || bin.includes( '\\' ) ) {
		return {
			passed: false,
			detail: `Invalid test case: bin must be a basename-only file, got: ${ bin }`,
		};
	}

	if ( ! bin.endsWith( '.js' ) ) {
		return {
			passed: false,
			detail: `Invalid test case: bin must end with .js, got: ${ bin }`,
		};
	}

	return null;
}

/**
 * Validate safe flag requirement (credential-free/non-executing)
 * @param {string[]} args
 * @return {TestResult|null} error result or null if valid
 */
function validateSafeFlag( args ) {
	const safeFlags = [ '--help', '-h', '--version', '-v' ];
	const separatorIndex = args.indexOf( '--' );
	const argsBeforeSeparator = separatorIndex === -1 ? args : args.slice( 0, separatorIndex );
	const hasSafeFlag = argsBeforeSeparator.some( arg => safeFlags.includes( arg ) );
	if ( ! hasSafeFlag ) {
		return {
			passed: false,
			detail: `Invalid test case: args must include a safe flag (${ safeFlags.join(
				', '
			) }) to prevent live execution`,
		};
	}

	return null;
}

/**
 * Validate expectation fields (extracted to reduce validateTestCase complexity)
 * @param {*} expectation
 * @return {TestResult|null} error result or null if valid
 */
function validateExpectationFields( expectation ) {
	// Validate stdoutIncludes is non-empty string if present
	if (
		expectation.stdoutIncludes !== undefined &&
		( typeof expectation.stdoutIncludes !== 'string' || expectation.stdoutIncludes === '' )
	) {
		return {
			passed: false,
			detail: 'Invalid test case: stdoutIncludes must be a non-empty string if specified',
		};
	}

	// Validate stderrIncludes is non-empty string if present
	if (
		expectation.stderrIncludes !== undefined &&
		( typeof expectation.stderrIncludes !== 'string' || expectation.stderrIncludes === '' )
	) {
		return {
			passed: false,
			detail: 'Invalid test case: stderrIncludes must be a non-empty string if specified',
		};
	}

	// Validate exitCode is an integer if present
	if (
		expectation.exitCode !== undefined &&
		( typeof expectation.exitCode !== 'number' || ! Number.isInteger( expectation.exitCode ) )
	) {
		return {
			passed: false,
			detail: 'Invalid test case: exitCode must be an integer if specified',
		};
	}

	return null;
}

/**
 * Check if a filesystem entry exists, is not a symlink, and has the expected type.
 * @param {string} entryPath
 * @param {{ label: string, expectedType: 'file'|'directory' }} options
 * @return {TestResult|null} error result or null if valid
 */
function checkFileSystemEntry( entryPath, { label, expectedType } ) {
	if ( ! existsSync( entryPath ) ) {
		return {
			passed: false,
			detail: `${ label } not found: ${ entryPath }. Run 'npm run build' first.`,
		};
	}

	try {
		const lstats = lstatSync( entryPath );
		if ( lstats.isSymbolicLink() ) {
			return {
				passed: false,
				detail: `${ label } path is a symlink (rejected for security): ${ entryPath }`,
			};
		}

		if ( expectedType === 'file' && ! lstats.isFile() ) {
			return {
				passed: false,
				detail: `${ label } path exists but is not a regular file: ${ entryPath }`,
			};
		}

		if ( expectedType === 'directory' && ! lstats.isDirectory() ) {
			return {
				passed: false,
				detail: `${ label } path exists but is not a directory: ${ entryPath }`,
			};
		}
	} catch ( err ) {
		return {
			passed: false,
			detail: `Failed to stat ${ label.toLowerCase() }: ${ getErrorMessage( err ) }`,
		};
	}

	return null;
}

/**
 * Validate dist/bin before any binary path is discovered or executed.
 * @return {TestResult|null} error result or null if valid
 */
function checkDistBinDirectory() {
	return checkFileSystemEntry( distBinDir, {
		label: 'dist/bin directory',
		expectedType: 'directory',
	} );
}

/**
 * Check if binary exists and is a regular file (rejects symlinks for defense-in-depth)
 * @param {string} binPath
 * @param {string} [label]
 * @return {TestResult|null} error result or null if valid
 */
function checkBinaryFileSystem( binPath, label = 'Binary' ) {
	return checkFileSystemEntry( binPath, { label, expectedType: 'file' } );
}

/**
 * Validate required built child binaries before root dispatch smoke cases run
 * @param {string[]|undefined} requiredChildBins
 * @return {TestResult|null} error result or null if valid
 */
function validateRequiredChildBins( requiredChildBins ) {
	if ( requiredChildBins === undefined ) {
		return null;
	}

	for ( const childBin of requiredChildBins ) {
		const binaryPathError = validateBinaryPathRules( childBin );
		if ( binaryPathError ) {
			return {
				passed: false,
				detail: binaryPathError.detail.replace( 'bin must', 'required child bin must' ),
			};
		}

		const childBinPath = path.join( distBinDir, childBin );
		const fileSystemError = checkBinaryFileSystem( childBinPath, 'Required child binary' );
		if ( fileSystemError ) {
			return fileSystemError;
		}
	}

	return null;
}

/**
 * Validate test case structure and binary path
 * @param {TestCase} testCase
 * @return {TestResult|null} error result or null if valid
 */
function validateTestCase( testCase ) {
	// Validate basic structure and required fields
	const structureError = validateTestCaseStructure( testCase );
	if ( structureError ) {
		return structureError;
	}

	// Validate binary path rules
	const binaryPathError = validateBinaryPathRules( testCase.bin );
	if ( binaryPathError ) {
		return binaryPathError;
	}

	// Validate safe flag requirement
	const safeFlagError = validateSafeFlag( testCase.args );
	if ( safeFlagError ) {
		return safeFlagError;
	}

	// Validate expectation fields
	const expectationError = validateExpectationFields( testCase.expectation );
	if ( expectationError ) {
		return expectationError;
	}

	const distBinError = checkDistBinDirectory();
	if ( distBinError ) {
		return distBinError;
	}

	// Check binary file system
	const binPath = path.join( distBinDir, testCase.bin );
	const fileSystemError = checkBinaryFileSystem( binPath );
	if ( fileSystemError ) {
		return fileSystemError;
	}

	const childBinsError = validateRequiredChildBins( testCase.requiredChildBins );
	if ( childBinsError ) {
		return childBinsError;
	}

	return null;
}

/**
 * Evaluate spawnSync output against the test case expectation.
 * @param {*} result
 * @param {TestCase} testCase
 * @return {TestResult}
 */
function evaluateSpawnResult( result, testCase ) {
	if ( result.error ) {
		const spawnError = result.error;
		if ( typeof spawnError === 'object' && spawnError !== null && 'code' in spawnError ) {
			const errorWithCode = /** @type {{ code?: string, message: string }} */ ( spawnError );
			if ( errorWithCode.code === 'ETIMEDOUT' ) {
				return {
					passed: false,
					detail: `Timeout after ${ TIMEOUT_MS }ms`,
				};
			}
		}

		return {
			passed: false,
			detail: `Spawn error: ${ getErrorMessage( result.error ) }`,
		};
	}

	if ( result.signal ) {
		return {
			passed: false,
			detail: `Process killed by signal: ${ result.signal }`,
		};
	}

	if ( result.status === null ) {
		return {
			passed: false,
			detail: 'Process exit status is null (process may have failed to start)',
		};
	}

	const expectedExitCode = testCase.expectation.exitCode ?? 0;
	if ( result.status !== expectedExitCode ) {
		return {
			passed: false,
			detail: `Exit code ${ result.status }, expected ${ expectedExitCode }`,
		};
	}

	if (
		testCase.expectation.stdoutIncludes &&
		! result.stdout.includes( testCase.expectation.stdoutIncludes )
	) {
		return {
			passed: false,
			detail: `Stdout missing expected text: "${ testCase.expectation.stdoutIncludes }"`,
		};
	}

	if (
		testCase.expectation.stderrIncludes &&
		! result.stderr.includes( testCase.expectation.stderrIncludes )
	) {
		return {
			passed: false,
			detail: `Stderr missing expected text: "${ testCase.expectation.stderrIncludes }"`,
		};
	}

	return {
		passed: true,
		detail: 'PASS',
	};
}

/**
 * Run a single test case
 * @param {TestCase} testCase
 * @return {TestResult} result with passed and detail properties
 */
function runTestCase( testCase ) {
	const validationError = validateTestCase( testCase );
	if ( validationError ) {
		return validationError;
	}

	const binPath = path.join( distBinDir, testCase.bin );
	let credentialScope;
	let smokeResult;

	try {
		credentialScope = createCredentialScope();
	} catch ( err ) {
		return {
			passed: false,
			detail: `Failed to create credential scope: ${ getErrorMessage( err ) }`,
		};
	}

	try {
		const result = spawnSync( nodeExec, [ binPath, ...testCase.args ], {
			cwd: projectRoot,
			env: credentialScope.env,
			timeout: TIMEOUT_MS,
			encoding: 'utf8',
			shell: false,
		} );

		smokeResult = evaluateSpawnResult( result, testCase );
	} catch ( err ) {
		smokeResult = {
			passed: false,
			detail: `Spawn error: ${ getErrorMessage( err ) }`,
		};
	}

	try {
		cleanupCredentialScope( credentialScope.root );
	} catch ( err ) {
		if ( ! smokeResult.passed ) {
			return smokeResult;
		}

		return {
			passed: false,
			detail: `Failed to cleanup credential scope: ${ getErrorMessage( err ) }`,
		};
	}

	return smokeResult;
}

/**
 * Preflight check: dist/bin exists and is a directory
 */
function preflightCheck() {
	const distBinError = checkDistBinDirectory();
	if ( distBinError ) {
		console.error( 'ERROR: dist/bin directory is not usable.' );
		console.error( 'Please run "npm run build" before running smoke tests.' );
		console.error( `Expected directory: ${ distBinDir }` );
		console.error( `Reason: ${ distBinError.detail }` );
		return false;
	}

	return true;
}

/**
 * Main execution
 */
function main() {
	console.log( '=== VIP CLI Release Smoke Test ===' );
	console.log( `Node: ${ process.version }` );
	console.log( `CWD: ${ projectRoot }` );
	console.log( `Target: ${ distBinDir }` );
	console.log( '' );

	// Preflight
	if ( ! preflightCheck() ) {
		process.exit( 1 );
	}

	let passCount = 0;
	let failCount = 0;

	// Run all test cases
	for ( const testCase of testCases ) {
		const result = runTestCase( testCase );

		if ( result.passed ) {
			passCount++;
			console.log( `[PASS] ${ testCase.name }` );
		} else {
			failCount++;
			console.log( `[FAIL] ${ testCase.name }` );
			console.log( `  Reason: ${ result.detail }` );
			console.log( `  Command: ${ formatCommandForLogging( testCase.bin, testCase.args ) }` );
		}
	}

	// Summary
	console.log( '' );
	console.log( '=== Summary ===' );
	console.log( `Total:  ${ testCases.length }` );
	console.log( `Passed: ${ passCount }` );
	console.log( `Failed: ${ failCount }` );
	console.log( '' );

	// Exit with appropriate code
	if ( failCount > 0 ) {
		console.error( 'Some tests failed. Please review and fix before releasing.' );
		process.exit( 1 );
	} else {
		console.log( 'All tests passed!' );
		process.exit( 0 );
	}
}

// Execute if run directly
if ( require.main === module ) {
	main();
}

module.exports = { runTestCase, testCases, formatCommandForLogging, preflightCheck };
