#!/usr/bin/env node

const assert = require( 'node:assert/strict' );
const { spawnSync } = require( 'node:child_process' );
const { createHash } = require( 'node:crypto' );
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );

async function probe( root, scratch ) {
	const landoRoot = path.join( root, 'node_modules', 'lando' );
	// The package paths are built from the extracted, isolated payload root.
	// eslint-disable-next-line security/detect-non-literal-require
	const Lando = require( path.join( landoRoot, 'lib', 'lando.js' ) );
	// eslint-disable-next-line security/detect-non-literal-require
	const LandoDaemon = require( path.join( landoRoot, 'lib', 'daemon.js' ) );
	LandoDaemon.prototype.getVersions = async () => ( {
		docker: 'fake',
		compose: 'fake',
		composePlugin: 'fake',
	} );

	const userConfRoot = path.join( scratch, 'lando' );
	const lando = new Lando( {
		configSources: [],
		pluginDirs: [ landoRoot ],
		userConfRoot,
		home: path.join( scratch, 'lando-home' ),
		logDir: path.join( scratch, 'lando-logs' ),
		dockerBin: false,
		composeBin: false,
		logLevelConsole: 'error',
	} );
	await lando.bootstrap( 'app' );
	const plugins = lando.config.plugins.map( plugin => plugin.name );
	const tasks = lando.tasks.map( task => task.command );
	const builders = lando.factory.get().map( builder => builder.name );
	assert( plugins.includes( 'lando-core' ) );
	assert( plugins.includes( 'lando-proxy' ) );
	assert( plugins.includes( 'lando-tooling' ) );
	assert( tasks.includes( 'start' ) );
	assert( tasks.includes( 'ssh' ) );
	assert( builders.length > 2 );
	assert( fs.statSync( path.join( userConfRoot, 'scripts', 'lando-entrypoint.sh' ) ).isFile() );
	assert( fs.statSync( path.join( userConfRoot, 'scripts', 'proxy-certs.sh' ) ).isFile() );
	assert(
		fs.readFileSync( path.join( root, 'assets', 'dev-env.lando.template.yml.ejs' ), 'utf8' )
			.length > 0
	);
	assert(
		fs.readFileSync( path.join( root, 'assets', 'dev-env.nginx.template.conf.ejs' ), 'utf8' )
			.length > 0
	);

	// eslint-disable-next-line security/detect-non-literal-require
	const keytar = require( path.join( root, 'node_modules', '@github', 'keytar' ) );
	assert.equal( typeof keytar.getPassword, 'function' );
	assert.equal( typeof keytar.setPassword, 'function' );
	assert.equal( typeof keytar.deletePassword, 'function' );

	const companion = path.join(
		root,
		'bin',
		process.platform === 'win32' ? 'go-search-replace.exe' : 'go-search-replace'
	);
	assert( fs.statSync( companion ).isFile() );
	if ( process.platform !== 'win32' ) {
		fs.accessSync( companion, fs.constants.X_OK );
	}
	const replaced = spawnSync( companion, [ 'old.example', 'new.example' ], {
		input: "INSERT INTO wp_options VALUES ('old.example');\n",
		encoding: 'utf8',
		env: { PATH: '' },
	} );
	assert.ifError( replaced.error );
	assert.equal( replaced.status, 0, replaced.stderr );
	assert.equal( replaced.stdout, "INSERT INTO wp_options VALUES ('new.example');\n" );

	console.log(
		JSON.stringify( {
			plugins: plugins.length,
			tasks: tasks.length,
			builders: builders.length,
			keytar: 'loaded without credential access',
			companion: 'replaced SQL offline',
		} )
	);
}

function isolatedEnvironment( scratch ) {
	return {
		BUN_BE_BUN: '1',
		HOME: scratch,
		XDG_CACHE_HOME: path.join( scratch, 'cache' ),
		XDG_CONFIG_HOME: path.join( scratch, 'config' ),
		XDG_DATA_HOME: path.join( scratch, 'data' ),
		DO_NOT_TRACK: '1',
		PATH: '',
		TMPDIR: scratch,
		TEMP: scratch,
		TMP: scratch,
		SystemRoot: process.env.SystemRoot,
		WINDIR: process.env.WINDIR,
	};
}

function verifyCompanionDigest( root ) {
	const { arch, platform } = process;
	const goos = platform === 'win32' ? 'windows' : platform;
	const goarch = { x64: 'amd64', ia32: '386', arm64: 'arm64' }[ arch ];
	if ( ! goarch ) {
		throw new Error( `No manifest architecture mapping for ${ arch }` );
	}
	const manifest = fs.readFileSync(
		path.join( __dirname, '..', 'third_party', 'go-search-replace', 'MANIFEST' ),
		'utf8'
	);
	const expected = manifest
		.split( '\n' )
		.find( line => line.startsWith( `${ goos }/${ goarch } ` ) )
		?.trim()
		.split( /\s+/ )[ 1 ];
	if ( ! expected ) {
		throw new Error( `No pinned companion digest for ${ goos }/${ goarch }` );
	}
	const companion = path.join(
		root,
		'bin',
		platform === 'win32' ? 'go-search-replace.exe' : 'go-search-replace'
	);
	const actual = createHash( 'sha256' ).update( fs.readFileSync( companion ) ).digest( 'hex' );
	assert.equal( actual, expected, 'Embedded companion differs from pinned verified release' );
}

function main() {
	const [ binaryArgument, resourceRootArgument, ...rest ] = process.argv.slice( 2 );
	if ( binaryArgument === '--probe' ) {
		const ownedScratch = rest[ 0 ]
			? null
			: fs.mkdtempSync( path.join( os.tmpdir(), 'vip-bun-resource-probe-' ) );
		return Promise.resolve( probe( resourceRootArgument, rest[ 0 ] || ownedScratch ) ).finally(
			() => {
				if ( ownedScratch ) {
					fs.rmSync( ownedScratch, { recursive: true, force: true } );
				}
			}
		);
	}
	if ( ! binaryArgument || ! resourceRootArgument || rest.length ) {
		throw new Error(
			'Usage: node helpers/bun-resource-smoke.js /absolute/path/to/vip /absolute/path/to/extracted-resources'
		);
	}

	const binary = path.resolve( binaryArgument );
	const root = path.resolve( resourceRootArgument );
	const scratch = fs.mkdtempSync( path.join( os.tmpdir(), 'vip-bun-resource-smoke-' ) );
	try {
		verifyCompanionDigest( root );
		const env = isolatedEnvironment( scratch );

		const probePath = path.join( scratch, 'probe.js' );
		fs.copyFileSync( __filename, probePath );
		const checked = spawnSync( binary, [ probePath, '--probe', root, scratch ], {
			cwd: scratch,
			env,
			encoding: 'utf8',
		} );
		assert.ifError( checked.error );
		assert.equal( checked.status, 0, checked.stderr );
		process.stdout.write( checked.stdout );
	} finally {
		fs.rmSync( scratch, { recursive: true, force: true } );
	}
}

Promise.resolve()
	.then( main )
	.catch( error => {
		console.error( error );
		process.exitCode = 1;
	} );
