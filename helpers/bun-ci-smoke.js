#!/usr/bin/env node

// Portable CI checks. The larger handler/strace harness runs separately on Linux.
const assert = require( 'node:assert/strict' );
const { spawnSync } = require( 'node:child_process' );
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );

const sourceRoot = path.resolve( __dirname, '..' );
const scope = fs.mkdtempSync( path.join( os.tmpdir(), 'vip-bun-ci-' ) );

function run( executable, args, env, cwd = scope, timeout = 60000 ) {
	const result = spawnSync( executable, args, {
		cwd,
		env,
		encoding: 'utf8',
		timeout,
		maxBuffer: 4 * 1024 * 1024,
	} );
	if ( result.error ) {
		let cacheState;
		try {
			const cache = path.join( env.XDG_CACHE_HOME, 'vip-cli', 'standalone-resources' );
			cacheState = fs.readdirSync( cache ).map( entry => ( {
				entry,
				ready: fs.existsSync( path.join( cache, entry, '.archive-sha256' ) ),
			} ) );
		} catch ( error ) {
			cacheState = error.code;
		}
		throw new Error(
			`${ args.join( ' ' ) }: ${ result.error.message }\n` +
				`Cache: ${ JSON.stringify( cacheState ) }\n` +
				`stdout:\n${ result.stdout || '' }\nstderr:\n${ result.stderr || '' }`,
			{ cause: result.error }
		);
	}
	assert.equal( result.signal, null, result.stderr );
	assert.equal( result.status, 0, result.stderr + result.stdout );
	return result.stdout;
}

try {
	const name = process.platform === 'win32' ? 'vip.exe' : 'vip';
	const binary = path.join( scope, name );
	fs.copyFileSync( path.join( sourceRoot, 'bin', name ), binary );
	fs.chmodSync( binary, 0o700 );
	const env = {
		HOME: scope,
		USERPROFILE: scope,
		LOCALAPPDATA: path.join( scope, 'local' ),
		APPDATA: path.join( scope, 'roaming' ),
		XDG_CONFIG_HOME: path.join( scope, 'config' ),
		XDG_CACHE_HOME: path.join( scope, 'cache' ),
		XDG_DATA_HOME: path.join( scope, 'data' ),
		XDG_RUNTIME_DIR: path.join( scope, 'runtime' ),
		TMPDIR: scope,
		TMP: scope,
		TEMP: scope,
		PATH: '',
		SystemRoot: process.env.SystemRoot,
		WINDIR: process.env.WINDIR,
		API_HOST: 'http://127.0.0.1:1',
		DBUS_SESSION_BUS_ADDRESS: `unix:path=${ path.join( scope, 'missing-bus' ) }`,
		NODE_ENV: 'test',
		DO_NOT_TRACK: '1',
		CI: 'true',
		NO_COLOR: '1',
		DEBUG: '@automattic/vip:bun-launcher,@automattic/vip:keychain,@automattic/vip:bin:vip',
		RUNNER_TRACKING_ID: process.env.RUNNER_TRACKING_ID,
	};
	const coldTimeout = process.platform === 'win32' ? 180000 : 60000;
	for ( const args of [ [], [ 'config', 'envvar', 'list' ], [ 'dev-env', 'list' ] ] ) {
		const started = Date.now();
		assert.match(
			run( binary, [ ...args, '--help' ], env, scope, args.length ? 60000 : coldTimeout ),
			/Usage:/
		);
		console.log( `PASS ${ args.join( ' ' ) || 'root' } help (${ Date.now() - started }ms)` );
	}
	const { version } = require( '../package.json' );
	assert.ok( run( binary, [ '--version' ], env ).includes( version ) );
	if ( process.platform === 'win32' ) {
		// Also exercise cold startup with production's default logging behavior.
		const started = Date.now();
		assert.match(
			run(
				binary,
				[ '--help' ],
				{ ...env, DEBUG: '', XDG_CACHE_HOME: path.join( scope, 'default-cache' ) },
				scope,
				coldTimeout
			),
			/Usage:/
		);
		console.log( `PASS Windows cold startup without DEBUG (${ Date.now() - started }ms)` );
	}
	const cache = path.join( env.XDG_CACHE_HOME, 'vip-cli', 'standalone-resources' );
	const roots = fs.readdirSync( cache ).filter( entry => /^[a-f0-9]{64}$/.test( entry ) );
	assert.equal( roots.length, 1, 'Expected one extracted runtime payload' );
	process.stdout.write(
		run(
			process.execPath,
			[ path.join( __dirname, 'bun-resource-smoke.js' ), binary, path.join( cache, roots[ 0 ] ) ],
			env
		)
	);
	console.log( 'PASS relocated help, version, native addon, Lando, and offline companion' );
} finally {
	fs.rmSync( scope, { recursive: true, force: true } );
}
