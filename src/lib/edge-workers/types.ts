/**
 * Shared types for the edge-workers commands.
 *
 * The local half of edge workers (scaffold + compile) is language-specific and
 * lives behind the Toolchain abstraction; the remote half (upload, list, toggle)
 * is language-neutral because the deployable artifact is always a `.wasm` binary.
 */

/**
 * The languages/SDKs an edge-workers project can be scaffolded with. Only
 * AssemblyScript is implemented today; new toolchains slot in via the registry
 * in `./toolchains` without touching the command layer.
 */
export type EdgeWorkerType = 'assemblyscript';

export const SUPPORTED_EDGE_WORKER_TYPES: EdgeWorkerType[] = [ 'assemblyscript' ];

export const DEFAULT_EDGE_WORKER_TYPE: EdgeWorkerType = 'assemblyscript';

/** The behavior to apply when a worker errors at runtime (mirrors the API enum). */
export type EdgeWorkerOnFailure = 'continue' | 'error';

/** The request/response phases a worker hooks into, derived from its wasm exports (mirrors the API enum). */
export type EdgeWorkerPhase =
	| 'client_request'
	| 'client_response'
	| 'origin_request'
	| 'origin_response';

/** The operators available for matching an edge worker's location (mirrors the API enum). */
export type EdgeWorkerLocationOperator = 'contains' | 'equals' | 'starts_with' | 'ends_with';

export const EDGE_WORKER_LOCATION_OPERATORS: EdgeWorkerLocationOperator[] = [
	'contains',
	'equals',
	'starts_with',
	'ends_with',
];

/** A rule scoping which requests a worker runs on. Runs on all requests when absent. */
export interface EdgeWorkerLocation {
	operator: EdgeWorkerLocationOperator;
	value: string;
}

/**
 * The project descriptor written once at `init` to the project root
 * (`edge-workers.json`). It records which toolchain the project uses so that
 * `new`/`build`/`deploy` can dispatch without re-asking. It is intentionally NOT
 * a registry of workers — workers are discovered by scanning for `worker.json`.
 */
export interface ProjectDescriptor {
	type: EdgeWorkerType;
	/** The pinned SDK dependency spec, for reference (e.g. `@automattic/vip-edge-workers-sdk@^0.1.0`). */
	sdk?: string;
}

/**
 * The per-worker manifest (`worker.json`) co-located with each worker's code.
 * Holds exactly the metadata the create/update API needs, keyed by `name`.
 */
export interface WorkerManifest {
	/** The human-readable name; the per-site unique key used to reconcile create-vs-update. */
	name: string;
	/** Entry source file, relative to the worker directory. Defaults per toolchain. */
	entry: string;
	location?: EdgeWorkerLocation;
	on_failure?: EdgeWorkerOnFailure;
}

/** A worker discovered on disk: its directory plus parsed manifest. */
export interface DiscoveredWorker {
	/** Absolute path to the worker directory. */
	dir: string;
	manifest: WorkerManifest;
}

/** A deployed edge worker as returned by the API. */
export interface EdgeWorker {
	id: number;
	name: string;
	location: EdgeWorkerLocation | null;
	phases: EdgeWorkerPhase[];
	onFailure: EdgeWorkerOnFailure;
	active: boolean;
	createdAt: string;
	updatedAt: string;
	/** Only present when explicitly requested (on-demand field). */
	source?: string | null;
	/** Only present when explicitly requested (on-demand field). */
	wasmBinary?: string | null;
}
