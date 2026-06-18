#!/usr/bin/env node

const { buildSync } = require( 'esbuild' );
const { spawnSync } = require( 'node:child_process' );
const { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } = require( 'node:fs' );
const path = require( 'node:path' );
const tar = require( 'tar' );

const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

const projectRoot = path.resolve( __dirname, '..' );
const seaDir = path.join( projectRoot, 'dist', 'sea' );
const bundlePath = path.join( seaDir, 'vip.bundle.cjs' );
const blobPath = path.join( seaDir, 'vip.blob' );
const seaConfigPath = path.join( seaDir, 'sea-config.json' );
const executablePath = path.join( seaDir, process.platform === 'win32' ? 'vip.exe' : 'vip' );
const nodeModulesArchivePath = path.join( seaDir, 'node_modules.tgz' );

function run( command, args, options = {} ) {
	const result = spawnSync( command, args, {
		cwd: projectRoot,
		stdio: 'inherit',
		...options,
	} );

	if ( result.status !== 0 ) {
		process.exit( result.status || 1 );
	}
}

function ensureNode22() {
	const major = Number( process.versions.node.split( '.' )[ 0 ] );
	if ( major !== 22 ) {
		console.error(
			`Error: SEA build requires Node 22.x. Current version is ${ process.versions.node }.`
		);
		process.exit( 1 );
	}
}

async function createRuntimeArchive() {
	await tar.c(
		{
			cwd: projectRoot,
			file: nodeModulesArchivePath,
			gzip: true,
			portable: true,
			noMtime: true,
		},
		[ 'node_modules' ]
	);
}

function writeSeaConfig() {
	const config = {
		main: bundlePath,
		output: blobPath,
		disableExperimentalSEAWarning: true,
		assets: {
			'dev-env.lando.template.yml.ejs': path.join(
				projectRoot,
				'assets',
				'dev-env.lando.template.yml.ejs'
			),
			'dev-env.nginx.template.conf.ejs': path.join(
				projectRoot,
				'assets',
				'dev-env.nginx.template.conf.ejs'
			),
			'sea.node_modules.tgz': nodeModulesArchivePath,
		},
	};

	writeFileSync( seaConfigPath, `${ JSON.stringify( config, null, 2 ) }\n`, 'utf8' );
}

function buildBundle() {
	buildSync( {
		entryPoints: [ path.join( projectRoot, 'src', 'bin', 'vip-sea.js' ) ],
		bundle: true,
		platform: 'node',
		target: 'node22',
		format: 'cjs',
		outfile: bundlePath,
		external: [
			'@github/keytar',
			'@github/keytar/*',
			'cpu-features',
			'cpu-features/*',
			'lando',
			'lando/*',
			'ssh2',
			'ssh2/*',
			'*.node',
		],
	} );
}

function stripBundleShebang() {
	const bundleContent = readFileSync( bundlePath, 'utf8' );
	if ( ! bundleContent.startsWith( '#!' ) ) {
		return;
	}

	writeFileSync( bundlePath, bundleContent.replace( /^#![^\n]*\n/, '' ), 'utf8' );
}

function buildBlob() {
	run( process.execPath, [ '--experimental-sea-config', seaConfigPath ] );
}

function prepareExecutable() {
	copyFileSync( process.execPath, executablePath );

	if ( process.platform === 'darwin' ) {
		run( 'codesign', [ '--remove-signature', executablePath ] );
	}
}

function injectBlob() {
	const postjectCli = require.resolve( 'postject/dist/cli.js' );
	const args = [
		postjectCli,
		executablePath,
		'NODE_SEA_BLOB',
		blobPath,
		'--sentinel-fuse',
		SEA_FUSE,
	];

	if ( process.platform === 'darwin' ) {
		args.push( '--macho-segment-name', 'NODE_SEA' );
	}

	if ( process.platform === 'win32' ) {
		args.push( '--overwrite' );
	}

	run( process.execPath, args );
}

function finalizeExecutable() {
	if ( process.platform === 'darwin' ) {
		run( 'codesign', [ '--sign', '-', '--force', executablePath ] );
	}

	if ( process.platform !== 'win32' ) {
		chmodSync( executablePath, 0o755 );
	}
}

async function main() {
	ensureNode22();
	mkdirSync( seaDir, { recursive: true } );
	await createRuntimeArchive();
	writeSeaConfig();
	buildBundle();
	stripBundleShebang();
	buildBlob();
	prepareExecutable();
	injectBlob();
	finalizeExecutable();

	console.log( `SEA executable written to ${ executablePath }` );
}

void main();
