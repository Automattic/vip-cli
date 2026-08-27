import {
	createEdgeWorker,
	listEdgeWorkers,
	setEdgeWorkerActive,
	updateEdgeWorker,
	validateEdgeWorker,
} from '../api/edge-workers';
import UserError from '../user-error';
import { buildWorker, readPrebuiltWorker, readWorkerSource } from './index';
import { escapeTerminalText } from './output';

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
	enableAfterDeploy: boolean;
	intendedActive: boolean;
}

export interface EdgeWorkerDeploymentPlanOptions {
	appId: number;
	envId: number;
	projectDir: string;
	workers: readonly DiscoveredWorker[];
	skipBuild: boolean;
	skipValidate: boolean;
	skipSource: boolean;
	enableAfterDeploy: boolean;
}

export type EdgeWorkerAppliedCallback = (
	item: EdgeWorkerDeploymentPlanItem,
	result: EdgeWorker
) => void | Promise< void >;

export class DeploymentApplyError extends Error {
	public readonly appliedNames: string[];
	public readonly failedName: string;
	public readonly unappliedNames: string[];
	public readonly stage: 'upload' | 'enable';
	public readonly uploadCompleted: boolean;
	public readonly activeAfterUpload: boolean | null;

	constructor(
		appliedNames: string[],
		failedName: string,
		unappliedNames: string[],
		cause: unknown,
		state: {
			stage: 'upload' | 'enable';
			uploadCompleted: boolean;
			activeAfterUpload: boolean | null;
		}
	) {
		super( `Failed to apply edge worker "${ failedName }".`, { cause } );
		this.name = 'DeploymentApplyError';
		this.appliedNames = appliedNames;
		this.failedName = failedName;
		this.unappliedNames = unappliedNames;
		this.stage = state.stage;
		this.uploadCompleted = state.uploadCompleted;
		this.activeAfterUpload = state.activeAfterUpload;
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
	if ( source !== undefined ) {
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
	const intendedActive = options.enableAfterDeploy || Boolean( existing?.active );

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
		enableAfterDeploy: options.enableAfterDeploy,
		intendedActive,
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
	return location
		? `${ escapeTerminalText( location.operator ) } "${ escapeTerminalText( location.value ) }"`
		: 'all requests';
}

function currentActiveLabel( item: EdgeWorkerDeploymentPlanItem ): string {
	if ( ! item.existing ) {
		return 'new';
	}
	return item.existing.active ? 'active' : 'inactive';
}

export function deploymentPlanRows(
	items: readonly EdgeWorkerDeploymentPlanItem[]
): Record< string, string >[] {
	return items.map( item => ( {
		worker: escapeTerminalText( item.worker.manifest.name ),
		action: item.action,
		current_active: currentActiveLabel( item ),
		final_active: item.intendedActive ? 'active' : 'inactive',
		current_scope: formatLocation( item.currentLocation ),
		proposed_scope: formatLocation( item.proposedLocation ),
		validation: item.validation,
		phases: item.phases.map( escapeTerminalText ).join( ', ' ) || 'none',
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
				cause,
				{ stage: 'upload', uploadCompleted: false, activeAfterUpload: null }
			);
		}

		let finalResult = result;
		if ( item.enableAfterDeploy && ! result.active ) {
			try {
				// eslint-disable-next-line no-await-in-loop
				finalResult = await setEdgeWorkerActive( envId, result.id, true );
			} catch ( cause ) {
				throw new DeploymentApplyError(
					[ ...appliedNames ],
					name,
					items.slice( index + 1 ).map( remaining => remaining.worker.manifest.name ),
					cause,
					{
						stage: 'enable',
						uploadCompleted: true,
						activeAfterUpload: result.active,
					}
				);
			}
		}

		appliedNames.push( name );
		// eslint-disable-next-line no-await-in-loop
		await onApplied( item, finalResult );
	}
}
