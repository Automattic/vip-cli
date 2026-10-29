#!/usr/bin/env node

// Smoke test a copied native executable from an empty, isolated directory.
// Usage: node helpers/bun-binary-smoke.js /absolute/path/to/vip
const assert = require( 'node:assert/strict' );
const { spawn } = require( 'node:child_process' );
const fs = require( 'node:fs' );
const http = require( 'node:http' );
const os = require( 'node:os' );
const path = require( 'node:path' );

const sourceRoot = path.resolve( __dirname, '..' );
const sourceBin = path.join( sourceRoot, 'src/bin/vip.ts' );
const sqlFixture = path.join( sourceRoot, '__fixtures__/cli/bun-binary/valid.sql' );
const timeoutMs = 15000;

function routesFrom( filename, args = [] ) {
	const routes = [ args ];
	const basename = path.basename( filename, '.ts' );
	const source = fs.readFileSync( filename, 'utf8' );
	for ( const match of source.matchAll( /\.command\(\s*['"]([^'"]+)['"]/g ) ) {
		const child = path.join( sourceRoot, 'src/commands', `${ basename }-${ match[ 1 ] }.ts` );
		assert.ok( fs.existsSync( child ), `Missing source command ${ child }` );
		routes.push( ...routesFrom( child, [ ...args, match[ 1 ] ] ) );
	}
	return routes;
}

function environment( scope, apiHost ) {
	const home = path.join( scope, 'home' );
	const config = path.join( scope, 'config' );
	const data = path.join( scope, 'data' );
	const cache = path.join( scope, 'cache' );
	const runtime = path.join( scope, 'runtime' );
	const emptyPath = path.join( scope, 'empty-path' );
	for ( const directory of [ home, config, data, cache, runtime, emptyPath ] ) {
		fs.mkdirSync( directory, { recursive: true } );
	}
	return {
		PATH: emptyPath,
		HOME: home,
		USERPROFILE: home,
		XDG_CONFIG_HOME: config,
		XDG_DATA_HOME: data,
		XDG_CACHE_HOME: cache,
		XDG_RUNTIME_DIR: runtime,
		TMPDIR: scope,
		TMP: scope,
		TEMP: scope,
		API_HOST: apiHost,
		NODE_ENV: 'test',
		DO_NOT_TRACK: '1',
		CI: '1',
		NO_COLOR: '1',
		// libsecret must not discover or start the developer's D-Bus session.
		DBUS_SESSION_BUS_ADDRESS: `unix:path=${ path.join( runtime, 'missing-bus' ) }`,
	};
}

function run( executable, args, options ) {
	return new Promise( ( resolve, reject ) => {
		const child = spawn( executable, args, {
			cwd: options.cwd,
			env: options.env,
			detached: true,
			stdio: [ 'ignore', 'pipe', 'pipe' ],
		} );
		let stdout = '';
		let stderr = '';
		let timedOut = false;
		const timer = setTimeout( () => {
			timedOut = true;
			try {
				process.kill( -child.pid, 'SIGKILL' );
			} catch ( error ) {
				if ( error.code !== 'ESRCH' ) throw error;
			}
		}, timeoutMs );
		child.stdout.setEncoding( 'utf8' );
		child.stderr.setEncoding( 'utf8' );
		child.stdout.on( 'data', chunk => ( stdout += chunk ) );
		child.stderr.on( 'data', chunk => ( stderr += chunk ) );
		child.once( 'error', error => {
			clearTimeout( timer );
			reject( error );
		} );
		child.once( 'close', ( status, signal ) => {
			clearTimeout( timer );
			resolve( { status, signal, stdout, stderr, timedOut } );
		} );
	} );
}

function assertResult( result, status, output ) {
	assert.equal( result.timedOut, false, 'Native executable timed out' );
	assert.equal( result.signal, null, `Native executable exited on ${ result.signal }` );
	assert.equal( result.status, status, result.stderr + result.stdout );
	if ( output ) {
		assert.match( result.stdout + result.stderr, output );
	}
	assert.doesNotMatch( result.stdout + result.stderr, /Ready to authenticate\?/ );
}

function seedLoopbackToken( env, apiHost, token ) {
	const url = new URL( apiHost );
	assert.equal( url.protocol, 'http:' );
	assert.equal( url.hostname, '127.0.0.1' );
	assert.ok( Number( url.port ) >= 32768, 'Credential needs an ephemeral loopback port' );
	const service = `vip-go-cli:${ apiHost.replace( /[^a-z0-9]/gi, '-' ) }`;
	const store = path.join( env.XDG_CONFIG_HOME, 'configstore', 'vip-go-cli.json' );
	fs.mkdirSync( path.dirname( store ), { recursive: true } );
	const values = fs.existsSync( store ) ? JSON.parse( fs.readFileSync( store, 'utf8' ) ) : {};
	values[ service ] = token;
	fs.writeFileSync( store, JSON.stringify( values ) );
}

function fixtureToken() {
	const claim = {
		id: 42,
		iat: Math.floor( Date.now() / 1000 ) - 60,
		exp: Math.floor( Date.now() / 1000 ) + 3600,
	};
	const encoded = value => Buffer.from( JSON.stringify( value ) ).toString( 'base64url' );
	return `${ encoded( { alg: 'none', typ: 'JWT' } ) }.${ encoded( claim ) }.fixture`;
}

async function mockApi() {
	const requests = [];
	const server = http.createServer( async ( request, response ) => {
		let body = '';
		for await ( const chunk of request ) body += chunk;
		requests.push( { method: request.method, url: request.url, headers: request.headers, body } );
		response.writeHead( 200, { 'content-type': 'application/json' } );
		response.end(
			JSON.stringify( {
				data: {
					me: {
						id: 42,
						displayName: 'Binary Fixture',
						trackingUserId: 'fixture',
						isVIP: false,
						organizationRoles: { nodes: [] },
					},
				},
			} )
		);
	} );
	await new Promise( resolve => server.listen( 0, '127.0.0.1', resolve ) );
	const address = server.address();
	assert.ok( address && typeof address !== 'string' );
	return {
		server,
		requests,
		host: `http://127.0.0.1:${ address.port }`,
	};
}

async function traced( executable, args, options, traceFile ) {
	assert.ok(
		fs.existsSync( '/usr/bin/strace' ),
		'strace is required to prove checkout independence'
	);
	const result = await run(
		'/usr/bin/strace',
		[ '-f', '-qq', '-e', 'trace=file,connect', '-o', traceFile, executable, ...args ],
		options
	);
	const trace = fs.readFileSync( traceFile, 'utf8' );
	const checkoutReads = trace.split( '\n' ).filter( line => line.includes( sourceRoot + '/' ) );
	assert.deepEqual(
		checkoutReads,
		[],
		`Native executable accessed checkout files:\n${ checkoutReads.join( '\n' ) }`
	);
	const remoteConnections = trace
		.split( '\n' )
		.filter(
			line =>
				line.includes( 'connect(' ) &&
				line.includes( 'AF_INET' ) &&
				! line.includes( '127.0.0.1' ) &&
				! line.includes( '::1' )
		);
	assert.deepEqual(
		remoteConnections,
		[],
		`Native executable attempted non-loopback network:\n${ remoteConnections.join( '\n' ) }`
	);
	return result;
}

async function main() {
	if ( process.platform !== 'linux' ) {
		throw new Error( 'This harness requires Linux D-Bus isolation and strace.' );
	}
	const input = process.argv[ 2 ];
	assert.ok( input && path.isAbsolute( input ), 'Pass an absolute native executable path' );
	assert.ok( fs.statSync( input ).isFile(), 'Target must be a regular file' );
	const descriptor = fs.openSync( input, 'r' );
	try {
		const magic = Buffer.alloc( 4 );
		fs.readSync( descriptor, magic, 0, magic.length, 0 );
		assert.deepEqual( [ ...magic ], [ 0x7f, 0x45, 0x4c, 0x46 ], 'Target must be a native ELF' );
	} finally {
		fs.closeSync( descriptor );
	}
	const scope = fs.mkdtempSync( path.join( os.tmpdir(), 'vip-bun-binary-' ) );
	let api;
	try {
		const binary = path.join( scope, 'vip' );
		fs.copyFileSync( input, binary );
		fs.chmodSync( binary, 0o700 );
		api = await mockApi();
		const token = fixtureToken();
		const base = { cwd: scope, env: environment( scope, api.host ) };
		seedLoopbackToken( base.env, api.host, token );
		const routes = routesFrom( sourceBin );
		assert.equal( routes.length, 78, 'Command source surface changed; review smoke coverage' );
		let passed = 0;
		const check = async ( name, action ) => {
			try {
				await action();
				passed++;
				console.log( `PASS ${ name }` );
			} catch ( error ) {
				throw new Error( `${ name }: ${ error.stack || error }` );
			}
		};

		await check( 'production config and insecure keychain fallback', async () => {
			const env = {
				...base.env,
				DEBUG: '@automattic/vip:lib:cli:config,@automattic/vip:keychain,@automattic/vip:bin:vip',
			};
			const result = await run( binary, [ '--help' ], { ...base, env } );
			assertResult( result, 0, /Usage:/ );
			assert.doesNotMatch( result.stderr, /Could not find a valid configuration file/ );
			assert.match( result.stderr, /falling back to Insecure keychain/ );
			assert.doesNotMatch( result.stderr, /RUNNING DEV VERSION/ );
		} );

		for ( const args of routes ) {
			// Keep one native process active at a time so failures identify one route.
			// eslint-disable-next-line no-await-in-loop
			await check( `help vip ${ args.join( ' ' ) || '(root)' }`, async () => {
				const result = await run( binary, [ ...args, '--help' ], base );
				assertResult( result, 0, /Usage:/ );
			} );
		}

		await check( 'version', async () => {
			const result = await run( binary, [ '--version' ], base );
			assertResult( result, 0 );
			assert.ok(
				( result.stdout + result.stderr ).includes( require( '../package.json' ).version )
			);
		} );
		await check( 'unknown command error', async () => {
			const result = await run( binary, [ 'no-such-command' ], base );
			assertResult( result, 1, /not a valid subcommand/ );
		} );
		await check( 'nested -- boundary', async () => {
			const result = await run( binary, [ 'wp', '--help', '--', 'option', 'get', 'home' ], base );
			assertResult( result, 0, /Usage:/ );
		} );
		await check( 'missing -- error', async () => {
			const result = await run( binary, [ 'wp', 'post', 'list', '--help' ], base );
			assertResult( result, 1, /double dash/ );
		} );
		await check( 'alias route help', async () => {
			const result = await run( binary, [ '@fixture.develop', 'logs', '--help' ], base );
			assertResult( result, 0, /Usage:/ );
		} );
		await check( 'SQL validation reads a local file', async () => {
			const sql = path.join( scope, 'valid.sql' );
			fs.copyFileSync( sqlFixture, sql );
			const result = await traced(
				binary,
				[ 'import', 'validate-sql', sql ],
				base,
				path.join( scope, 'sql.trace' )
			);
			assertResult( result, 0, /CREATE TABLE/ );
		} );

		assert.equal( api.requests.length, 0, 'Non-API checks contacted the mock API' );
		await check( 'mocked GraphQL whoami with real auth', async () => {
			const result = await traced( binary, [ 'whoami' ], base, path.join( scope, 'api.trace' ) );
			assertResult( result, 0, /Howdy Binary Fixture/ );
			assert.equal( api.requests.length, 1 );
			assert.equal( api.requests[ 0 ].method, 'POST' );
			assert.match( api.requests[ 0 ].url, /^\/graphql/ );
			assert.match( api.requests[ 0 ].body, /\bme\b/ );
			assert.match( api.requests[ 0 ].headers.authorization || '', /Bearer /i );
		} );
		await check( 'edge worker project and worker templates', async () => {
			const project = path.join( scope, 'edge-project' );
			let result = await traced(
				binary,
				[ 'edge-workers', 'init', project ],
				base,
				path.join( scope, 'edge.trace' )
			);
			assertResult( result, 0, /Created a new assemblyscript/ );
			assert.match(
				fs.readFileSync( path.join( project, 'README.md' ), 'utf8' ),
				/AssemblyScript edge workers/
			);
			assert.equal(
				JSON.parse( fs.readFileSync( path.join( project, 'package.json' ), 'utf8' ) ).name,
				'edge-workers'
			);
			result = await run(
				binary,
				[ 'edge-workers', 'new', 'fixture-worker', '--path', project ],
				base
			);
			assertResult( result, 0, /Created worker/ );
			assert.match(
				fs.readFileSync( path.join( project, 'workers/fixture-worker/assembly/index.ts' ), 'utf8' ),
				/onClientResponse/
			);
		} );
		assert.equal( api.requests.length, 1, 'Local commands contacted the mock API' );
		console.log(
			`Native executable smoke: ${ passed } checks passed (${
				routes.length - 1
			} command help routes plus root).`
		);
	} finally {
		if ( api ) await new Promise( resolve => api.server.close( resolve ) );
		if ( process.env.VIP_BUN_SMOKE_KEEP_SCOPE === '1' ) {
			console.error( `Kept smoke scope: ${ scope }` );
		} else {
			fs.rmSync( scope, { recursive: true, force: true } );
		}
	}
}

if ( require.main === module ) {
	main().catch( error => {
		console.error( error.stack || error );
		process.exitCode = 1;
	} );
}

module.exports = { routesFrom };
