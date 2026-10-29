// Run after npm run build. Use real built commands, without credentials or I/O.
const assert = require( 'node:assert/strict' );
const { spawnSync } = require( 'node:child_process' );
const {
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} = require( 'node:fs' );
const { tmpdir } = require( 'node:os' );
const path = require( 'node:path' );
const { test } = require( 'node:test' );

const root = path.resolve( __dirname, '..' );
const preload = path.join( root, '__fixtures__/cli/single-process/preload.cjs' );
const commandPath = path.join( root, 'dist/lib/cli/command.js' );

function isolatedRun( args ) {
	const scope = mkdtempSync( path.join( tmpdir(), 'vip-single-process-' ) );
	try {
		return spawnSync( process.execPath, [ '--require', preload, ...args ], {
			cwd: root,
			encoding: 'utf8',
			timeout: 15000,
			env: {
				...process.env,
				HOME: scope,
				XDG_CONFIG_HOME: scope,
				XDG_DATA_HOME: scope,
				NODE_ENV: 'test',
				DO_NOT_TRACK: '1',
				NODE_OPTIONS: '',
			},
		} );
	} finally {
		rmSync( scope, { recursive: true, force: true } );
	}
}

function commandRoutes( filename, args = [] ) {
	const routes = [ { filename, args } ];
	const source = readFileSync( filename, 'utf8' );
	const basename = path.basename( filename, '.js' );
	for ( const match of source.matchAll( /\.command\(\s*['"]([^'"]+)['"]/g ) ) {
		const child = path.join( root, 'dist/commands', `${ basename }-${ match[ 1 ] }.js` );
		routes.push( ...commandRoutes( child, [ ...args, match[ 1 ] ] ) );
	}
	return routes;
}

const routes = commandRoutes( path.join( root, 'dist/bin/vip.js' ) );
for ( const { args } of routes ) {
	test( `root dispatch vip ${ args.join( ' ' ) } --help`, () => {
		const result = isolatedRun( [ 'dist/bin/vip.js', ...args, '--help' ] );
		assert.equal( result.status, 0, result.stderr + result.stdout );
		assert.match( result.stdout, /Usage:/ );
	} );
}

test( 'the package exposes one executable and routes to every internal command', () => {
	assert.deepEqual( require( '../package.json' ).bin, { vip: 'dist/bin/vip.js' } );
	assert.deepEqual( require( '../package-lock.json' ).packages[ '' ].bin, {
		vip: 'dist/bin/vip.js',
	} );
	assert.deepEqual( readdirSync( path.join( root, 'dist/bin' ) ), [ 'vip.js' ] );
	const modules = readdirSync( path.join( root, 'dist/commands' ) )
		.filter( filename => /^vip-.*\.js$/.test( filename ) )
		.sort();
	assert.deepEqual(
		routes
			.slice( 1 )
			.map( route => path.basename( route.filename ) )
			.sort(),
		modules
	);
} );

test( 'an npm-style vip symlink resolves internal commands without sibling bins', () => {
	const directory = mkdtempSync( path.join( tmpdir(), 'vip-entrypoint-symlink-' ) );
	try {
		const executable = path.join( directory, 'vip' );
		symlinkSync( path.join( root, 'dist/bin/vip.js' ), executable );
		const result = isolatedRun( [ executable, 'config', 'envvar', 'list', '--help' ] );
		assert.equal( result.status, 0, result.stderr + result.stdout );
		assert.match( result.stdout, /Usage:/ );
	} finally {
		rmSync( directory, { recursive: true, force: true } );
	}
} );

test( 'nested asynchronous execution retains pid, argv, status, and lazy loading', () => {
	const directory = mkdtempSync( path.join( tmpdir(), 'vip-nested-dispatch-' ) );
	try {
		const parent = path.join( directory, 'vip.js' );
		const middle = path.join( directory, 'vip-middle.js' );
		const leaf = path.join( directory, 'vip-middle-leaf.js' );
		const command = `require(${ JSON.stringify( commandPath ) }).default`;
		writeFileSync(
			parent,
			`global.parentPid = process.pid;
			exports.default = ${ command }({}).command('middle', '').argv(process.argv);`
		);
		writeFileSync(
			middle,
			`exports.default = ${ command }({}).command('leaf', '').argv(process.argv);`
		);
		writeFileSync(
			leaf,
			`exports.default = ${ command }({wildcardCommand: true})
			.option('slug', '').argv(process.argv, async (args, options) => {
				await new Promise(resolve => setImmediate(resolve));
				console.log(JSON.stringify({pid: process.pid, parentPid: global.parentPid,
					argv: process.argv, args, slug: options.slug,
					landoLoaded: Object.keys(require.cache).some(file => file.includes('/node_modules/lando/'))}));
				process.exitCode = 7;
			});`
		);
		const payload = [ 'echo', '@literal', '-x=value', 'a b', '$literal' ];
		const result = isolatedRun( [ parent, '--slug=example', 'middle', 'leaf', '--', ...payload ] );
		assert.equal( result.status, 7, result.stderr + result.stdout );
		const data = JSON.parse( result.stdout );
		assert.equal( data.pid, data.parentPid );
		assert.deepEqual( data.argv.slice( 1 ), [ leaf, '--slug=example', '--', ...payload ] );
		assert.deepEqual( data.args, payload );
		assert.equal( data.slug, 'example' );
		assert.equal( data.landoLoaded, false );
	} finally {
		rmSync( directory, { recursive: true, force: true } );
	}
} );

test( 'dev-env root safeguard remains active through root dispatch', () => {
	const result = isolatedRun( [
		'-e',
		`process.getuid = () => 0;
		process.argv = [process.execPath, ${ JSON.stringify(
			path.join( root, 'dist/bin/vip.js' )
		) }, 'dev-env', 'list', '--help'];
		require(process.argv[1]);`,
	] );
	assert.equal( result.status, 1, result.stderr + result.stdout );
	assert.match( result.stderr, /should not be run as root/ );
} );
