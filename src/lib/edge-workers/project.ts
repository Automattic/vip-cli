/**
 * Edge-workers project resolution and on-disk layout helpers.
 *
 * Layout (created by `vip edge-workers init`):
 *
 *   edge-workers/
 *     edge-workers.json        <- project descriptor (toolchain type)
 *     package.json
 *     lib/                     <- shared modules
 *     workers/
 *       <name>/
 *         worker.json          <- per-worker manifest
 *         assembly/index.ts    <- entry (toolchain-specific)
 */

import fs from 'node:fs';
import path from 'node:path';

import UserError from '../user-error';
import { parseProjectDescriptor, parseWorkerManifest } from './validation';

import type { DiscoveredWorker, ProjectDescriptor, WorkerManifest } from './types';

export const PROJECT_DESCRIPTOR_FILE = 'edge-workers.json';
export const WORKER_MANIFEST_FILE = 'worker.json';
export const WORKERS_DIR = 'workers';
/** Conventional output directory for compiled artifacts, relative to the project root. */
export const BUILD_DIR = 'build';
/** Conventional subfolder checked when resolving from a site-repo root. */
export const CONVENTIONAL_PROJECT_DIR = 'edge-workers';

function isProjectRoot( dir: string ): boolean {
	return fs.existsSync( path.join( dir, PROJECT_DESCRIPTOR_FILE ) );
}

/**
 * Read a project file as UTF-8, rejecting symlinks before opening so a symlinked
 * descriptor/manifest can't redirect the read outside the project tree.
 */
function readProjectFile( file: string, label: string ): string {
	let stat: fs.Stats;
	try {
		stat = fs.lstatSync( file );
	} catch {
		throw new UserError( `Could not read ${ label } at "${ file }".` );
	}
	if ( stat.isSymbolicLink() ) {
		throw new UserError( `${ label } at "${ file }" must not be a symbolic link.` );
	}
	try {
		return fs.readFileSync( file, 'utf8' );
	} catch {
		throw new UserError( `Could not read ${ label } at "${ file }".` );
	}
}

/**
 * Resolve the edge-workers project directory for a command.
 *
 * Resolution order:
 *   1. `--path` if provided (must contain a project descriptor).
 *   2. Walk up from the current working directory looking for the descriptor.
 *   3. The conventional `./edge-workers` subfolder, if present.
 *   4. Otherwise throw a UserError with guidance.
 */
export function resolveProjectDir(
	opts: { path?: string } = {},
	cwd: string = process.cwd()
): string {
	if ( opts.path !== undefined ) {
		// `--path` passed without a value arrives as a boolean, not a string;
		// guard so we surface a clear error instead of a throw from path.resolve().
		if ( typeof opts.path !== 'string' || opts.path === '' ) {
			throw new UserError( 'The --path flag requires a path to the edge-workers project.' );
		}

		const explicit = path.resolve( cwd, opts.path );
		if ( ! isProjectRoot( explicit ) ) {
			throw new UserError(
				`No edge-workers project found at "${ explicit }" (missing ${ PROJECT_DESCRIPTOR_FILE }).`
			);
		}

		return explicit;
	}

	// Walk up from cwd.
	let current = path.resolve( cwd );

	while ( true ) {
		if ( isProjectRoot( current ) ) {
			return current;
		}

		const parent = path.dirname( current );
		if ( parent === current ) {
			break;
		}
		current = parent;
	}

	// Conventional subfolder fallback.
	const conventional = path.resolve( cwd, CONVENTIONAL_PROJECT_DIR );
	if ( isProjectRoot( conventional ) ) {
		return conventional;
	}

	throw new UserError(
		'No edge-workers project found here. Run `vip edge-workers init` to create one, ' +
			'run the command from inside a project, or pass `--path` to point at one.'
	);
}

export function readProjectDescriptor( projectDir: string ): ProjectDescriptor {
	const file = path.join( projectDir, PROJECT_DESCRIPTOR_FILE );
	const raw = readProjectFile( file, 'project descriptor' );

	let parsed: unknown;
	try {
		parsed = JSON.parse( raw ) as unknown;
	} catch {
		throw new UserError( `Project descriptor at "${ file }" is not valid JSON.` );
	}

	return parseProjectDescriptor( parsed, file );
}

export function writeProjectDescriptor( projectDir: string, descriptor: ProjectDescriptor ): void {
	const file = path.join( projectDir, PROJECT_DESCRIPTOR_FILE );
	fs.mkdirSync( projectDir, { recursive: true } );
	fs.writeFileSync( file, JSON.stringify( descriptor, null, '\t' ) + '\n' );
}

export function readWorkerManifest( workerDir: string ): WorkerManifest {
	const file = path.join( workerDir, WORKER_MANIFEST_FILE );
	const raw = readProjectFile( file, 'worker manifest' );

	let parsed: unknown;
	try {
		parsed = JSON.parse( raw ) as unknown;
	} catch {
		throw new UserError( `Worker manifest at "${ file }" is not valid JSON.` );
	}

	return parseWorkerManifest( parsed, file );
}

export function writeWorkerManifest( workerDir: string, manifest: WorkerManifest ): void {
	const file = path.join( workerDir, WORKER_MANIFEST_FILE );
	fs.mkdirSync( workerDir, { recursive: true } );
	fs.writeFileSync( file, JSON.stringify( manifest, null, '\t' ) + '\n' );
}

/** Discover all workers in a project by scanning each `workers/<name>/worker.json`. */
export function discoverWorkers( projectDir: string ): DiscoveredWorker[] {
	const workersRoot = path.join( projectDir, WORKERS_DIR );
	if ( ! fs.existsSync( workersRoot ) ) {
		return [];
	}

	const entries = fs.readdirSync( workersRoot, { withFileTypes: true } );
	const workers: DiscoveredWorker[] = [];
	const workersByName = new Map< string, DiscoveredWorker >();
	for ( const entry of entries ) {
		if ( ! entry.isDirectory() ) {
			continue;
		}

		const dir = path.join( workersRoot, entry.name );
		if ( ! fs.existsSync( path.join( dir, WORKER_MANIFEST_FILE ) ) ) {
			continue;
		}

		const worker = { dir, manifest: readWorkerManifest( dir ) };
		const normalizedName = worker.manifest.name.toLocaleLowerCase( 'en-US' );
		if ( workersByName.has( normalizedName ) ) {
			throw new UserError(
				`Duplicate worker name "${ worker.manifest.name }" found in this project.`
			);
		}
		workersByName.set( normalizedName, worker );
		workers.push( worker );
	}

	return workers.sort( ( left, right ) => left.manifest.name.localeCompare( right.manifest.name ) );
}

/**
 * Find a single worker by name (the manifest `name`, falling back to the
 * directory name for convenience).
 */
export function findWorker( projectDir: string, name: string ): DiscoveredWorker {
	const workers = discoverWorkers( projectDir );
	const match =
		workers.find( worker => worker.manifest.name === name ) ??
		workers.find( worker => path.basename( worker.dir ) === name );

	if ( ! match ) {
		const available = workers.map( worker => worker.manifest.name ).join( ', ' ) || '(none)';
		throw new UserError(
			`No worker named "${ name }" found in this project. Available workers: ${ available }.`
		);
	}

	return match;
}
