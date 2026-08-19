import {
	createEdgeWorker,
	listEdgeWorkers,
	updateEdgeWorker,
	validateEdgeWorker,
} from '../api/edge-workers';
import UserError from '../user-error';
import { buildWorker, readPrebuiltWorker, readWorkerSource } from './index';

import type { DiscoveredWorker, EdgeWorker, EdgeWorkerLocation, EdgeWorkerPhase } from './types';
import type { EdgeWorkerWriteInput } from '../api/edge-workers';

export interface EdgeWorkerDeploymentPlanItem {
	action: 'create' | 'update';
	worker: DiscoveredWorker;
	existing: EdgeWorker | null;
	artifact: { wasmPath: string; base64: string; sizeBytes: number };
	validation: 'passed' | 'skipped';
	phases: EdgeWorkerPhase[];
	input: EdgeWorkerWriteInput & { name: string; wasmBinary: string };
	currentLocation: EdgeWorkerLocation | null;
	proposedLocation: EdgeWorkerLocation | null;
	sourceMode: 'store' | 'omit' | 'preserve';
}

export interface EdgeWorkerDeploymentPlanOptions {
	appId: number;
	envId: number;
	projectDir: string;
	workers: readonly DiscoveredWorker[];
	skipBuild: boolean;
	skipValidate: boolean;
	skipSource: boolean;
}

export type EdgeWorkerAppliedCallback = (
	item: EdgeWorkerDeploymentPlanItem,
	result: EdgeWorker
) => void | Promise< void >;

export class DeploymentApplyError extends Error {
	public readonly appliedNames: string[];
	public readonly failedName: string;
	public readonly unappliedNames: string[];

	constructor(
		appliedNames: string[],
		failedName: string,
		unappliedNames: string[],
		cause: unknown
	) {
		super( `Failed to apply edge worker "${ failedName }".`, { cause } );
		this.name = 'DeploymentApplyError';
		this.appliedNames = appliedNames;
		this.failedName = failedName;
		this.unappliedNames = unappliedNames;
	}
}

function prepareArtifact( options: EdgeWorkerDeploymentPlanOptions, worker: DiscoveredWorker ) {
	if ( options.skipBuild ) {
		return readPrebuiltWorker( options.projectDir, worker );
	}
	return buildWorker( options.projectDir, worker );
}

async function prepareValidation(
	options: EdgeWorkerDeploymentPlanOptions,
	worker: DiscoveredWorker,
	artifact: EdgeWorkerDeploymentPlanItem[ 'artifact' ]
): Promise< Pick< EdgeWorkerDeploymentPlanItem, 'validation' | 'phases' > > {
	if ( options.skipValidate ) {
		return { validation: 'skipped', phases: [] };
	}

	const result = await validateEdgeWorker( options.envId, artifact.base64 );
	if ( result.valid !== true ) {
		const errors = result.errors.join( '; ' ) || 'unknown error';
		throw new UserError( `worker "${ worker.manifest.name }" failed validation: ${ errors }` );
	}

	return { validation: 'passed', phases: result.phases };
}

function proposedLocationFor(
	worker: DiscoveredWorker,
	existing: EdgeWorker | null,
	hasLocation: boolean,
	currentLocation: EdgeWorkerLocation | null
): EdgeWorkerLocation | null {
	if ( ! existing ) {
		return worker.manifest.location ?? null;
	}
	if ( ! hasLocation ) {
		return currentLocation;
	}
	return worker.manifest.location ?? null;
}

function prepareInput(
	worker: DiscoveredWorker,
	existing: EdgeWorker | null,
	artifact: EdgeWorkerDeploymentPlanItem[ 'artifact' ],
	source: string | undefined,
	hasLocation: boolean
): EdgeWorkerDeploymentPlanItem[ 'input' ] {
	const input: EdgeWorkerDeploymentPlanItem[ 'input' ] = {
		name: worker.manifest.name,
		wasmBinary: artifact.base64,
	};
	if ( worker.manifest.on_failure ) {
		input.onFailure = worker.manifest.on_failure;
	}
	if ( source ) {
		input.source = source;
	}
	if ( existing && hasLocation ) {
		input.location = worker.manifest.location ?? null;
	} else if ( ! existing && worker.manifest.location ) {
		input.location = worker.manifest.location;
	}
	return input;
}

function sourceModeFor(
	skipSource: boolean,
	existing: EdgeWorker | null
): EdgeWorkerDeploymentPlanItem[ 'sourceMode' ] {
	if ( ! skipSource ) {
		return 'store';
	}
	return existing ? 'preserve' : 'omit';
}

async function preparePlanItem(
	options: EdgeWorkerDeploymentPlanOptions,
	worker: DiscoveredWorker,
	existing: EdgeWorker | null
): Promise< EdgeWorkerDeploymentPlanItem > {
	const artifact = prepareArtifact( options, worker );
	const { validation, phases } = await prepareValidation( options, worker, artifact );
	const source = options.skipSource ? undefined : readWorkerSource( worker );
	const hasLocation = Object.hasOwn( worker.manifest, 'location' );
	const currentLocation = existing?.location ?? null;

	return {
		action: existing ? 'update' : 'create',
		worker,
		existing,
		artifact,
		validation,
		phases,
		input: prepareInput( worker, existing, artifact, source, hasLocation ),
		currentLocation,
		proposedLocation: proposedLocationFor( worker, existing, hasLocation, currentLocation ),
		sourceMode: sourceModeFor( options.skipSource, existing ),
	};
}

export async function prepareEdgeWorkerDeploymentPlan(
	options: EdgeWorkerDeploymentPlanOptions
): Promise< EdgeWorkerDeploymentPlanItem[] > {
	const remoteWorkers = await listEdgeWorkers( options.appId, options.envId );
	const remoteWorkersByName = new Map( remoteWorkers.map( worker => [ worker.name, worker ] ) );
	const items: EdgeWorkerDeploymentPlanItem[] = [];

	for ( const worker of options.workers ) {
		const existing = remoteWorkersByName.get( worker.manifest.name ) ?? null;
		// eslint-disable-next-line no-await-in-loop
		items.push( await preparePlanItem( options, worker, existing ) );
	}

	return items;
}

function formatLocation( location: EdgeWorkerLocation | null ): string {
	return location ? `${ location.operator } "${ location.value }"` : 'all requests';
}

export function deploymentPlanRows(
	items: readonly EdgeWorkerDeploymentPlanItem[]
): Record< string, string >[] {
	return items.map( item => ( {
		worker: item.worker.manifest.name,
		action: item.action,
		active: item.existing?.active ? 'yes' : 'no',
		current_scope: formatLocation( item.currentLocation ),
		proposed_scope: formatLocation( item.proposedLocation ),
		validation: item.validation,
		phases: item.phases.join( ', ' ) || 'none',
		bytes: String( item.artifact.sizeBytes ),
		source: item.sourceMode,
	} ) );
}

async function applyPlanItem(
	envId: number,
	item: EdgeWorkerDeploymentPlanItem
): Promise< EdgeWorker > {
	if ( item.action === 'create' ) {
		return createEdgeWorker( envId, item.input );
	}
	if ( ! item.existing ) {
		throw new Error( `Update plan for "${ item.worker.manifest.name }" has no existing worker.` );
	}
	return updateEdgeWorker( envId, item.existing.id, item.input );
}

export async function applyEdgeWorkerDeploymentPlan(
	envId: number,
	items: readonly EdgeWorkerDeploymentPlanItem[],
	onApplied: EdgeWorkerAppliedCallback
): Promise< void > {
	const appliedNames: string[] = [];

	for ( const [ index, item ] of items.entries() ) {
		const name = item.worker.manifest.name;
		let result: EdgeWorker;
		try {
			// eslint-disable-next-line no-await-in-loop
			result = await applyPlanItem( envId, item );
		} catch ( cause ) {
			throw new DeploymentApplyError(
				[ ...appliedNames ],
				name,
				items.slice( index + 1 ).map( remaining => remaining.worker.manifest.name ),
				cause
			);
		}

		appliedNames.push( name );
		// eslint-disable-next-line no-await-in-loop
		await onApplied( item, result );
	}
}
