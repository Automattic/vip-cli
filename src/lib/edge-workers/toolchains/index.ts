/**
 * Toolchain registry.
 *
 * A Toolchain encapsulates everything language-specific about an edge-workers
 * project: how to scaffold it, how to add a worker, how to verify the local
 * compiler is available, and how to compile a worker to a `.wasm` artifact.
 *
 * Everything downstream of `compile()` (base64, upload, list, toggle, delete)
 * is language-neutral, so adding a new language (e.g. Rust) means implementing
 * one Toolchain and registering it here — nothing in the command layer changes.
 */

import UserError from '../../user-error';
import { SUPPORTED_EDGE_WORKER_TYPES } from '../types';
import assemblyscript from './assemblyscript';

import type { DiscoveredWorker, EdgeWorkerType } from '../types';

export interface Toolchain {
	type: EdgeWorkerType;

	/** Scaffold a fresh project at `projectDir`. */
	scaffoldProject( projectDir: string ): void;

	/** Add a new worker named `name` to an existing project. */
	scaffoldWorker( projectDir: string, name: string ): void;

	/**
	 * Verify the local compiler toolchain is available for this project,
	 * throwing a UserError with remediation steps if not.
	 */
	ensureAvailable( projectDir: string ): void;

	/**
	 * Compile a worker to a `.wasm` binary. Returns the absolute path to the
	 * produced artifact.
	 */
	compile( projectDir: string, worker: DiscoveredWorker ): string;
}

const TOOLCHAINS: Record< EdgeWorkerType, Toolchain > = {
	assemblyscript,
};

export function getToolchain( type: EdgeWorkerType ): Toolchain {
	const toolchain = TOOLCHAINS[ type ];
	if ( ! toolchain ) {
		throw new UserError(
			`Unknown edge worker type "${ type }". Supported types: ${ SUPPORTED_EDGE_WORKER_TYPES.join(
				', '
			) }.`
		);
	}

	return toolchain;
}
