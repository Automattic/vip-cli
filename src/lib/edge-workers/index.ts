/**
 * Convenience entry point for the edge-workers lib: ties project resolution and
 * the toolchain together to produce a deployable artifact.
 */

import fs from 'node:fs';
import path from 'node:path';

import UserError from '../user-error';
import { readProjectDescriptor } from './project';
import { getToolchain } from './toolchains';

import type { DiscoveredWorker } from './types';

export * from './types';
export * from './project';
export * from './location';
export { getToolchain } from './toolchains';

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
	const wasmPath = path.join( projectDir, BUILD_DIR, `${ worker.manifest.name }.wasm` );
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
export function readWorkerSource( worker: DiscoveredWorker ): string | undefined {
	const entry = path.resolve( worker.dir, worker.manifest.entry );
	try {
		return fs.readFileSync( entry, 'utf8' );
	} catch {
		return undefined;
	}
}
