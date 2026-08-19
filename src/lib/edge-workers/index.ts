/**
 * Convenience entry point for the edge-workers lib: ties project resolution and
 * the toolchain together to produce a deployable artifact.
 */

import fs from 'node:fs';
import path from 'node:path';

import UserError from '../user-error';
import { readProjectDescriptor } from './project';
import { getToolchain } from './toolchains';
import { resolvePathWithin, validateWorkerName } from './validation';

import type { DiscoveredWorker } from './types';

export * from './types';
export * from './project';
export * from './location';
export { getToolchain } from './toolchains';
export * from './validation';

/** Conventional output directory for compiled artifacts, relative to the project root. */
export const BUILD_DIR = 'build';

interface BuiltArtifact {
	wasmPath: string;
	base64: string;
	sizeBytes: number;
}

function encodeArtifact( wasmPath: string ): BuiltArtifact {
	const buffer = fs.readFileSync( wasmPath );
	return { wasmPath, base64: buffer.toString( 'base64' ), sizeBytes: buffer.length };
}

/** Read a previously compiled artifact without recompiling (used by `deploy --skip-build`). */
export function readPrebuiltWorker( projectDir: string, worker: DiscoveredWorker ): BuiltArtifact {
	const name = validateWorkerName( worker.manifest.name );
	const wasmPath = resolvePathWithin(
		path.join( projectDir, BUILD_DIR ),
		`${ name }.wasm`,
		'Worker build artifact'
	);
	if ( ! fs.existsSync( wasmPath ) ) {
		throw new UserError(
			`No compiled artifact found for "${ worker.manifest.name }" at "${ wasmPath }". ` +
				'Run `vip edge-workers build` first, or deploy without `--skip-build`.'
		);
	}

	return encodeArtifact( wasmPath );
}

/** Compile a worker and return both the artifact path and its base64 encoding. */
export function buildWorker( projectDir: string, worker: DiscoveredWorker ): BuiltArtifact {
	const descriptor = readProjectDescriptor( projectDir );
	const toolchain = getToolchain( descriptor.type );

	toolchain.ensureAvailable( projectDir );
	const wasmPath = toolchain.compile( projectDir, worker );

	return encodeArtifact( wasmPath );
}

/** Read the entry source of a worker, for storing alongside the binary. */
export function readWorkerSource( worker: DiscoveredWorker ): string {
	const entry = resolvePathWithin( worker.dir, worker.manifest.entry, 'Worker entry' );
	try {
		return fs.readFileSync( entry, 'utf8' );
	} catch {
		throw new UserError( `Could not read worker source at "${ entry }".` );
	}
}
