import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { c as createTar } from 'tar';

const root = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const supportedTargets = {
	'bun-linux-x64': { platform: 'linux', go: 'linux/amd64', keytar: 'linux-x64' },
	'bun-linux-arm64': { platform: 'linux', go: 'linux/arm64', keytar: 'linux-arm64' },
	'bun-darwin-x64': { platform: 'darwin', go: 'darwin/amd64', keytar: 'darwin-x64' },
	'bun-darwin-arm64': { platform: 'darwin', go: 'darwin/arm64', keytar: 'darwin-arm64' },
	'bun-windows-x64': { platform: 'win32', go: 'windows/amd64', keytar: 'win32-x64' },
};

function buildTarget() {
	const args = process.argv.slice( 2 );
	if ( args.length === 0 ) {
		const target = `bun-${ process.platform === 'win32' ? 'windows' : process.platform }-${
			process.arch
		}`;
		if ( process.platform === 'linux' ) {
			const header = process.report?.getReport?.()?.header;
			if ( ! header?.glibcVersionRuntime ) {
				throw new Error( 'Native Linux binary builds require glibc; musl is unsupported.' );
			}
		}
		if ( ! Object.hasOwn( supportedTargets, target ) ) {
			throw new Error( `Unsupported Bun binary host: ${ process.platform }/${ process.arch }` );
		}
		return { name: target, ...supportedTargets[ target ], explicit: false };
	}
	if (
		args.length !== 2 ||
		args[ 0 ] !== '--target' ||
		! Object.hasOwn( supportedTargets, args[ 1 ] )
	) {
		throw new Error(
			`Expected --target followed by one of: ${ Object.keys( supportedTargets ).join( ', ' ) }`
		);
	}
	const target = args[ 1 ];
	return { name: target, ...supportedTargets[ target ], explicit: true };
}

function productionPackagePaths() {
	const npmCli = process.env.npm_execpath;
	const npmNode = process.env.npm_node_execpath;
	if ( ! npmCli || ! npmNode || ! /\.[cm]?js$/i.test( npmCli ) ) {
		throw new Error(
			'Build through npm run build:binary so npm can supply its CLI and Node paths.'
		);
	}
	return execFileSync(
		npmNode,
		[ npmCli, 'ls', '--all', '--parseable', '--omit=dev', '--silent' ],
		{
			cwd: root,
			encoding: 'utf8',
			maxBuffer: 32 * 1024 * 1024,
		}
	)
		.trim()
		.split( /\r?\n/ )
		.filter( filename => path.relative( root, filename ) !== '' );
}

function stagePackages( payload, targetDetails ) {
	const installed = productionPackagePaths();
	for ( const source of installed ) {
		const relative = path.relative( root, source );
		if ( relative.startsWith( '..' ) || ! relative.startsWith( `node_modules${ path.sep }` ) ) {
			throw new Error( `Production dependency outside node_modules: ${ source }` );
		}
		const packageName = JSON.parse(
			fs.readFileSync( path.join( source, 'package.json' ), 'utf8' )
		).name;
		const target = path.join( payload, relative );
		fs.cpSync( source, target, {
			recursive: true,
			filter: filename => {
				if ( fs.lstatSync( filename ).isSymbolicLink() ) {
					throw new Error( `Production package contains a symlink: ${ filename }` );
				}
				if ( filename === source ) {
					return true;
				}
				const segments = path.relative( source, filename ).split( path.sep );
				if (
					( packageName === '@github/keytar' &&
						( segments[ 0 ] === 'build' || segments[ 0 ] === 'prebuilds' ) ) ||
					( packageName === 'cpu-features' && segments[ 0 ] === 'build' ) ||
					( packageName === 'ssh2' &&
						segments.slice( 0, 4 ).join( '/' ) === 'lib/protocol/crypto/build' )
				) {
					return false;
				}
				if ( filename.endsWith( '.node' ) ) {
					throw new Error( `Unknown production native addon: ${ filename }` );
				}
				if (
					segments.some(
						segment =>
							segment === 'node_modules' ||
							segment === '.git' ||
							segment === '.npmrc' ||
							segment === '.yarnrc' ||
							segment === 'config.local.json' ||
							segment === 'credentials.json' ||
							segment === '.env' ||
							segment.startsWith( '.env.' )
					)
				) {
					return false;
				}
				return ! (
					relative.split( path.sep ).join( '/' ) ===
						'node_modules/@automattic/vip-search-replace' && segments[ 0 ] === 'bin'
				);
			},
		} );
	}
	const keytarSource = path.join(
		root,
		'node_modules',
		'@github',
		'keytar',
		'prebuilds',
		targetDetails.keytar,
		'keytar.node'
	);
	if ( ! fs.statSync( keytarSource, { throwIfNoEntry: false } )?.isFile() ) {
		throw new Error( `Missing keytar prebuild for ${ targetDetails.name }: ${ keytarSource }` );
	}
	const stagedKeytar = path.join( payload, 'node_modules', '@github', 'keytar', 'package.json' );
	if ( ! fs.statSync( stagedKeytar, { throwIfNoEntry: false } )?.isFile() ) {
		throw new Error( 'Production dependencies do not include @github/keytar.' );
	}
	const keytarTarget = path.join(
		payload,
		'node_modules',
		'@github',
		'keytar',
		'build',
		'Release',
		'keytar.node'
	);
	fs.mkdirSync( path.dirname( keytarTarget ), { recursive: true } );
	fs.copyFileSync( keytarSource, keytarTarget );
	console.log( `Staged ${ installed.length } production packages.` );
	console.log( `Staged keytar addon for ${ targetDetails.keytar }.` );
}

function stageAssets( payload ) {
	const tracked = execFileSync( 'git', [ 'ls-files', '-z', '--', 'assets' ], { cwd: root } )
		.toString( 'utf8' )
		.split( '\0' )
		.filter( Boolean );
	for ( const relative of tracked ) {
		if (
			! relative.startsWith( 'assets/' ) ||
			path.isAbsolute( relative ) ||
			relative.includes( '..' )
		) {
			throw new Error( `Unexpected tracked asset path: ${ relative }` );
		}
		const target = path.join( payload, relative );
		fs.mkdirSync( path.dirname( target ), { recursive: true } );
		fs.copyFileSync( path.join( root, relative ), target );
	}
	console.log( `Staged ${ tracked.length } tracked assets.` );
}

function stageSearchReplace( payload, targetDetails ) {
	const platform = targetDetails.go;
	const [ platformName, arch ] = platform.split( '/' );
	const manifest = fs.readFileSync(
		path.join( root, 'third_party/go-search-replace/MANIFEST' ),
		'utf8'
	);
	const expected = manifest
		.split( '\n' )
		.map( line => line.match( /^(\S+)\s+([a-f0-9]{64})$/ ) )
		.find( match => match?.[ 1 ] === platform )?.[ 2 ];
	if ( ! expected ) {
		throw new Error( `No pinned go-search-replace digest for ${ platform }` );
	}
	const extension = targetDetails.platform === 'win32' ? '.exe' : '';
	const source = path.join(
		root,
		'third_party/go-search-replace',
		`${ platformName }-${ arch }`,
		`go-search-replace${ extension }`
	);
	const actual = createHash( 'sha256' ).update( fs.readFileSync( source ) ).digest( 'hex' );
	if ( actual !== expected ) {
		throw new Error( `go-search-replace digest mismatch for ${ platform }` );
	}
	const target = path.join( payload, 'bin', `go-search-replace${ extension }` );
	fs.mkdirSync( path.dirname( target ), { recursive: true } );
	fs.copyFileSync( source, target );
	fs.chmodSync( target, 0o755 );
	console.log( `Staged verified go-search-replace for ${ platform }.` );
}

function stageCli( payload ) {
	const compiled = path.join( root, 'dist' );
	if ( ! fs.statSync( path.join( compiled, 'bin/vip.js' ), { throwIfNoEntry: false } )?.isFile() ) {
		throw new Error( 'Build the Node.js CLI before creating the Bun executable.' );
	}
	fs.cpSync( compiled, path.join( payload, 'dist' ), { recursive: true } );
	fs.copyFileSync( path.join( root, 'package.json' ), path.join( payload, 'package.json' ) );
	fs.mkdirSync( path.join( payload, 'config' ) );
	fs.copyFileSync(
		path.join( root, 'config/config.publish.json' ),
		path.join( payload, 'config/config.publish.json' )
	);
	fs.writeFileSync(
		path.join( payload, 'entry.cjs' ),
		[
			"const path = require('node:path');",
			'globalThis.__VIP_BUNDLED_RESOURCE_ROOT__ = __dirname;',
			"const filename = path.join(__dirname, 'dist/bin/vip.js');",
			'process.argv[1] = filename;',
			'require(filename);',
			'',
		].join( '\n' )
	);
}

function launcherSource() {
	const helper = path.join( root, 'src/lib/cli/standalone-resources.ts' );
	return [
		"import archivePath from './resources.tar.gz' with { type: 'file' };",
		"import { spawn } from 'node:child_process';",
		"import path from 'node:path';",
		`import { getBundledResourceRoot } from ${ JSON.stringify( helper ) };`,
		"const debugEnabled = (process.env.DEBUG || '').split(/[,\\s]+/).includes('@automattic/vip:bun-launcher');",
		"const trace = message => { if (debugEnabled) process.stderr.write('@automattic/vip:bun-launcher ' + message + '\\n'); };",
		'globalThis.__VIP_BUNDLED_ARCHIVE_PATH__ = archivePath;',
		"trace('extract:start');",
		'const resourceRoot = getBundledResourceRoot();',
		"trace('extract:ready');",
		"if (!resourceRoot) throw new Error('Standalone VIP resources were not extracted.');",
		"const script = path.join(resourceRoot, 'entry.cjs');",
		"trace('spawn:before');",
		"const child = spawn(process.execPath, ['--no-env-file', script, ...process.argv.slice(2)], {",
		"  stdio: 'inherit',",
		"  env: { ...process.env, BUN_BE_BUN: '1' },",
		'});',
		"child.once('spawn', () => trace('child:spawn'));",
		"child.once('exit', (code, signal) => trace('child:exit code=' + code + ' signal=' + signal));",
		"const signals = process.platform === 'win32' ? ['SIGINT', 'SIGTERM'] : ['SIGINT', 'SIGTERM', 'SIGHUP'];",
		'const handlers = signals.map(signal => {',
		'  const handler = () => child.kill(signal);',
		'  process.on(signal, handler);',
		'  return [signal, handler];',
		'});',
		'const { code, signal } = await new Promise((resolve, reject) => {',
		"  child.once('error', error => { trace('child:error code=' + (error.code || 'unknown')); reject(error); });",
		"  child.once('close', (code, signal) => { trace('child:close code=' + code + ' signal=' + signal); resolve({ code, signal }); });",
		'});',
		'for (const [signalName, handler] of handlers) process.off(signalName, handler);',
		"if (signal && process.platform !== 'win32') process.kill(process.pid, signal);",
		"process.exitCode = code ?? (signal ? 128 + (require('node:os').constants.signals[signal] || 1) : 1);",
		'',
	].join( '\n' );
}

async function main() {
	const target = buildTarget();
	const output = path.join( root, 'bin', `vip-bun${ target.platform === 'win32' ? '.exe' : '' }` );
	const temporary = fs.mkdtempSync( path.join( os.tmpdir(), 'vip-bun-build-' ) );
	try {
		const payload = path.join( temporary, 'payload' );
		fs.mkdirSync( payload );
		stageCli( payload );
		stagePackages( payload, target );
		stageAssets( payload );
		stageSearchReplace( payload, target );
		const archive = path.join( temporary, 'resources.tar.gz' );
		await createTar(
			{ cwd: payload, file: archive, gzip: true, portable: true, mtime: new Date( 0 ) },
			[ 'entry.cjs', 'dist', 'package.json', 'config', 'node_modules', 'assets', 'bin' ]
		);
		const entry = path.join( temporary, 'launcher.ts' );
		fs.writeFileSync( entry, launcherSource() );
		fs.mkdirSync( path.dirname( output ), { recursive: true } );
		const result = await globalThis.Bun.build( {
			entrypoints: [ entry ],
			compile: {
				outfile: output,
				...( target.explicit ? { target: target.name } : {} ),
				autoloadDotenv: false,
				autoloadBunfig: false,
				autoloadTsconfig: false,
				autoloadPackageJson: false,
			},
			target: 'bun',
		} );
		if ( ! result.success ) {
			for ( const log of result.logs ) console.error( log );
			throw new Error( 'Bun standalone compilation failed.' );
		}
		console.log( `Built ${ output }` );
	} finally {
		fs.rmSync( temporary, { recursive: true, force: true } );
	}
}

await main();
