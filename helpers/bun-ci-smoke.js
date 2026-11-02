#!/usr/bin/env node

// Portable CI checks. The larger handler/strace harness runs separately on Linux.
const assert = require( 'node:assert/strict' );
const { spawnSync } = require( 'node:child_process' );
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );

const sourceRoot = path.resolve( __dirname, '..' );
const scope = fs.mkdtempSync( path.join( os.tmpdir(), 'vip-bun-ci-' ) );

function overwrite( filename, contents ) {
	const descriptor = fs.openSync( filename, 'r+' );
	try {
		fs.ftruncateSync( descriptor );
		fs.writeFileSync( descriptor, contents );
	} finally {
		fs.closeSync( descriptor );
	}
}

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
	const extracted = path.join( cache, roots[ 0 ] );
	assert.equal(
		fs.existsSync( path.join( extracted, 'dist' ) ),
		false,
		'CLI code must be compiled into the executable'
	);
	assert.equal(
		fs.existsSync( path.join( extracted, 'entry.cjs' ) ),
		false,
		'Extracted CLI entrypoint must not exist'
	);
	process.stdout.write(
		run(
			process.execPath,
			[ path.join( __dirname, 'bun-resource-smoke.js' ), binary, extracted ],
			env
		)
	);
	console.log( 'PASS relocated help, version, native addon, Lando, and offline companion' );
	// Only mutate our disposable cache, after probing its disk-based resources.
	// Lando must use the compiled entrypoints even when their disk copies fail.
	for ( const relative of [
		'lodash/lodash.js',
		'js-yaml/dist/js-yaml.cjs.js',
		'bluebird/js/release/bluebird.js',
		'object-hash/index.js',
		'fast-glob/out/index.js',
		'winston/lib/winston.js',
		'logform/index.js',
		'winston-transport/index.js',
		'triple-beam/index.js',
	] ) {
		const filename = path.join( extracted, 'node_modules', relative );
		overwrite( filename, 'throw new Error("Uncompiled runtime dependency loaded");\n' );
	}
	// A filesystem-loaded plugin must share Winston's public companion exports.
	const pluginRoot = path.join(
		extracted,
		'node_modules',
		'lando',
		'plugins',
		'vip-bytecode-fixture'
	);
	fs.mkdirSync( pluginRoot );
	fs.writeFileSync(
		path.join( pluginRoot, 'index.js' ),
		`module.exports = () => {
			const assert = require('node:assert/strict');
			const winston = require('winston');
			const Transport = require('winston-transport');
			assert.equal(winston.Transport, Transport);
			assert(winston.transports.Console.prototype instanceof Transport);
			assert.equal(winston.format, require('logform').format);
			assert.equal(winston.config.npm, require('triple-beam').configs.npm);
			for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(winston.format))) {
				if (descriptor.get) assert.equal(typeof winston.format[name], 'function');
			}
			for (const name of Object.keys(winston.transports)) {
				assert.equal(typeof winston.transports[name], 'function');
			}
			console.log('VIP compiled logging fixture verified');
			return {};
		};`
	);
	// Keep authentication reads isolated and audit analytics UUID access under opt-out.
	// The real native addon was probed above without credential access.
	const keytarFixture = String.raw`const audit = operation => require('node:fs').appendFileSync(
		process.env.VIP_KEYCHAIN_FIXTURE_AUDIT, operation + '\n'
	);
	module.exports = {
		getPassword: async service => {
			if (service.endsWith('-uuid')) { audit('uuid read'); return 'fixture-uuid'; }
			return null;
		},
		setPassword: async () => { audit('write'); throw new Error('Unexpected credential write'); },
		deletePassword: async () => { audit('delete'); throw new Error('Unexpected credential deletion'); }
	};`;
	const keytarEntry = path.join(
		extracted,
		'node_modules',
		'@github',
		'keytar',
		'lib',
		'keytar.js'
	);
	overwrite( keytarEntry, keytarFixture );
	const landoState = path.join( env.XDG_DATA_HOME, 'vip', 'lando' );
	fs.mkdirSync( path.join( landoState, 'cache' ), { recursive: true } );
	fs.writeFileSync(
		path.join( landoState, 'config.yml' ),
		'dockerBin: false\ncomposeBin: false\nversions:\n  engine: "27.0.0"\n  compose: "2.30.0"\n  composePlugin: "2.30.0"\n'
	);
	fs.writeFileSync(
		path.join( landoState, 'cache', 'docker-version' ),
		JSON.stringify( { engine: '27.0.0', compose: '2.30.0', composePlugin: '2.30.0' } )
	);
	const keychainAudit = path.join( scope, 'keychain-access.log' );
	const list = run( binary, [ 'dev-env', 'list' ], {
		...env,
		VIP_KEYCHAIN_FIXTURE_AUDIT: keychainAudit,
		DOCKER_HOST: 'tcp://127.0.0.1:1',
		DEBUG: `${ env.DEBUG },@automattic/vip:bin:dev-environment`,
	} );
	assert.match( list, /Found 0 environments\./ );
	assert.match( list, /VIP compiled logging fixture verified/ );
	assert.equal( fs.existsSync( keychainAudit ), false, 'Opt-out accessed analytics UUID storage' );
	console.log( 'PASS compiled Lando dependencies with failing source entrypoints' );
} finally {
	fs.rmSync( scope, { recursive: true, force: true } );
}
