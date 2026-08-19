/**
 * AssemblyScript toolchain: scaffolds an AssemblyScript edge-workers project,
 * adds workers, and compiles them to `.wasm` with the canonical `asc` flags.
 *
 * The compile flags are a contract with the platform's WASM validator, so the
 * CLI owns them here rather than relying on user-authored build scripts — every
 * customer then compiles identically and a CLI update can fix everyone at once.
 *
 * The scaffolded file contents live in `./templates`; shared constants (versions,
 * SDK name, paths) live in `./constants`.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { BUILD_DIR, DEFAULT_ENTRY, SDK_PACKAGE, SDK_VERSION } from './constants';
import { GITIGNORE, PACKAGE_JSON, README, starterWorker, TSCONFIG_JSON } from './templates';
import UserError from '../../../user-error';
import { WORKERS_DIR, writeProjectDescriptor, writeWorkerManifest } from '../../project';
import { resolvePathWithin, validateWorkerName } from '../../validation';

import type { DiscoveredWorker } from '../../types';
import type { Toolchain } from '../index';

/** Write `contents` to `filePath`, creating any missing parent directories. */
function writeFileEnsuringDir( filePath: string, contents: string ): void {
	fs.mkdirSync( path.dirname( filePath ), { recursive: true } );
	fs.writeFileSync( filePath, contents );
}

function assertScaffoldTargetAvailable( projectDir: string ): void {
	if ( ! fs.existsSync( projectDir ) ) return;
	if ( ! fs.statSync( projectDir ).isDirectory() ) {
		throw new UserError(
			`Cannot create an edge-workers project at "${ projectDir }": target is not a directory.`
		);
	}
	if ( fs.readdirSync( projectDir ).length > 0 ) {
		throw new UserError(
			`Cannot create an edge-workers project at "${ projectDir }": target is not empty.`
		);
	}
}

function ascBinaryPath( projectDir: string ): string {
	const binName = process.platform === 'win32' ? 'asc.cmd' : 'asc';
	return path.join( projectDir, 'node_modules', '.bin', binName );
}

const toolchain: Toolchain = {
	type: 'assemblyscript',

	scaffoldProject( projectDir: string ): void {
		assertScaffoldTargetAvailable( projectDir );

		// Every write below ensures its own parent directory, so no standalone
		// mkdir is needed up front.
		writeProjectDescriptor( projectDir, {
			type: 'assemblyscript',
			sdk: `${ SDK_PACKAGE }@${ SDK_VERSION }`,
		} );
		writeFileEnsuringDir(
			path.join( projectDir, 'package.json' ),
			JSON.stringify( PACKAGE_JSON, null, '\t' ) + '\n'
		);
		writeFileEnsuringDir(
			path.join( projectDir, 'tsconfig.json' ),
			JSON.stringify( TSCONFIG_JSON, null, '\t' ) + '\n'
		);
		writeFileEnsuringDir( path.join( projectDir, '.gitignore' ), GITIGNORE );
		writeFileEnsuringDir( path.join( projectDir, 'README.md' ), README );
		// Keep the workers directory present (and committed) even when empty.
		writeFileEnsuringDir( path.join( projectDir, WORKERS_DIR, '.gitkeep' ), '' );
	},

	scaffoldWorker( projectDir: string, name: string ): void {
		validateWorkerName( name );
		const workerDir = path.join( projectDir, WORKERS_DIR, name );
		if ( fs.existsSync( workerDir ) ) {
			throw new UserError( `A worker directory already exists at "${ workerDir }".` );
		}

		writeWorkerManifest( workerDir, { name, entry: DEFAULT_ENTRY } );
		writeFileEnsuringDir( path.join( workerDir, DEFAULT_ENTRY ), starterWorker() );
	},

	ensureAvailable( projectDir: string ): void {
		const asc = ascBinaryPath( projectDir );
		if ( ! fs.existsSync( asc ) ) {
			throw new UserError(
				`The AssemblyScript compiler was not found at "${ asc }". ` +
					`Run \`npm install\` in "${ projectDir }" first.`
			);
		}
	},

	compile( projectDir: string, worker: DiscoveredWorker ): string {
		const asc = ascBinaryPath( projectDir );
		const entry = resolvePathWithin( worker.dir, worker.manifest.entry, 'Worker entry' );
		if ( ! fs.existsSync( entry ) ) {
			throw new UserError( `Worker entry file not found: "${ entry }".` );
		}

		const nodeModules = path.join( projectDir, 'node_modules' );
		const workerName = validateWorkerName( worker.manifest.name );
		const outFile = resolvePathWithin(
			path.join( projectDir, BUILD_DIR ),
			`${ workerName }.wasm`,
			'Worker build artifact'
		);
		fs.mkdirSync( path.dirname( outFile ), { recursive: true } );

		const args = [
			entry,
			'--runtime',
			'stub',
			'--path',
			nodeModules,
			'--outFile',
			outFile,
			'--optimizeLevel',
			'3',
			'--shrinkLevel',
			'2',
		];

		// Enable the json-as transform when it's installed so workers can parse JSON.
		// The transform lives at the `transform` subpath; the package root has no
		// requirable entry, so `--transform json-as` fails to resolve.
		if ( fs.existsSync( path.join( nodeModules, 'json-as' ) ) ) {
			args.push( '--transform', 'json-as/transform' );
		}

		// asc misbehaves if NODE_OPTIONS is inherited; drop it like the SDK build does.
		const env = { ...process.env };
		delete env.NODE_OPTIONS;

		const result = spawnSync( asc, args, { cwd: projectDir, env, encoding: 'utf8' } );

		if ( result.error ) {
			throw new UserError( `Failed to run the AssemblyScript compiler: ${ result.error.message }` );
		}

		if ( result.status !== 0 ) {
			const details = ( result.stderr || result.stdout || '' ).trim();
			throw new UserError(
				`Compilation failed for worker "${ worker.manifest.name }"${
					details ? `:\n${ details }` : '.'
				}`
			);
		}

		return outFile;
	},
};

export default toolchain;
