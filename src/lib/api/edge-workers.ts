/**
 * GraphQL access for edge workers.
 *
 * The schema exposes workers under `app.environments[].edgeWorkers`, with
 * `source` as an on-demand read field, plus create/update/setActive/delete mutations
 * keyed by `environmentId`. Worker names are unique per environment, so the CLI
 * reconciles create-vs-update by matching on `name`.
 *
 * NOTE: these types are hand-written rather than codegen'd because the edge
 * worker schema is not part of the public schema bundle the codegen runs against.
 */

import gql from 'graphql-tag';

import API from '../../lib/api';
import UserError from '../user-error';

import type {
	EdgeWorker,
	EdgeWorkerLocation,
	EdgeWorkerOnFailure,
	EdgeWorkerPhase,
} from '../edge-workers/types';

// Selector used by command.js for app/env context resolution.
export const appQuery = `
	id
	name
	environments {
		id
		appId
		name
		type
		primaryDomain {
			name
		}
	}
`;

const EDGE_WORKER_FIELDS = `
	id
	name
	location {
		operator
		value
	}
	phases
	onFailure
	active
	createdAt
	updatedAt
`;

interface EnvironmentWithWorkers {
	id: number;
	edgeWorkers: EdgeWorker[];
}

interface EdgeWorkersQueryResult {
	app: {
		environments: EnvironmentWithWorkers[];
	} | null;
}

function pickEnvWorkers( result: EdgeWorkersQueryResult | undefined, envId: number ): EdgeWorker[] {
	const env = result?.app?.environments?.find( candidate => candidate.id === envId );
	return env?.edgeWorkers ?? [];
}

function requireMutationPayload< T >( operation: string, value: T | null | undefined ): T {
	if ( value === null || value === undefined ) {
		throw new UserError( `${ operation } returned no result.` );
	}
	return value;
}

/** List the edge workers deployed to an environment without source. */
export async function listEdgeWorkers( appId: number, envId: number ): Promise< EdgeWorker[] > {
	const api = API();
	const response = await api.query< EdgeWorkersQueryResult >( {
		query: gql`
			query EdgeWorkers($appId: Int!) {
				app(id: $appId) {
					environments {
						id
						edgeWorkers {
							${ EDGE_WORKER_FIELDS }
						}
					}
				}
			}
		`,
		variables: { appId },
		fetchPolicy: 'no-cache',
	} );

	return pickEnvWorkers( response.data, envId );
}

/**
 * Fetch a single worker by name. The schema has no single-worker query, so this
 * requests the environment's workers and filters client-side. Source is fetched
 * only when explicitly requested.
 */
export async function getEdgeWorker(
	appId: number,
	envId: number,
	name: string,
	options: { includeSource?: boolean } = {}
): Promise< EdgeWorker | null > {
	const api = API();
	const fields =
		options.includeSource === true ? `${ EDGE_WORKER_FIELDS }\nsource` : EDGE_WORKER_FIELDS;
	const response = await api.query< EdgeWorkersQueryResult >( {
		query: gql`
			query EdgeWorkerDetail($appId: Int!) {
				app(id: $appId) {
					environments {
						id
						edgeWorkers {
							${ fields }
						}
					}
				}
			}
		`,
		variables: { appId },
		fetchPolicy: 'no-cache',
	} );

	return pickEnvWorkers( response.data, envId ).find( worker => worker.name === name ) ?? null;
}

/** Find a deployed worker by name, or null. Used to reconcile create-vs-update. */
export async function findEdgeWorkerByName(
	appId: number,
	envId: number,
	name: string
): Promise< EdgeWorker | null > {
	const workers = await listEdgeWorkers( appId, envId );
	return workers.find( worker => worker.name === name ) ?? null;
}

export interface EdgeWorkerWriteInput {
	name?: string;
	wasmBinary?: string;
	location?: EdgeWorkerLocation | null;
	onFailure?: EdgeWorkerOnFailure;
	source?: string;
}

export async function createEdgeWorker(
	envId: number,
	input: EdgeWorkerWriteInput & { name: string; wasmBinary: string }
): Promise< EdgeWorker > {
	const api = API();
	const response = await api.mutate< { createEdgeWorker: EdgeWorker | null } >( {
		mutation: gql`
			mutation CreateEdgeWorker($input: CreateEdgeWorkerInput!) {
				createEdgeWorker(input: $input) {
					${ EDGE_WORKER_FIELDS }
				}
			}
		`,
		variables: { input: { environmentId: envId, ...input } },
	} );

	return requireMutationPayload( 'createEdgeWorker', response.data?.createEdgeWorker );
}

export async function updateEdgeWorker(
	envId: number,
	edgeWorkerId: number,
	input: EdgeWorkerWriteInput
): Promise< EdgeWorker > {
	const api = API();
	const response = await api.mutate< { updateEdgeWorker: EdgeWorker | null } >( {
		mutation: gql`
			mutation UpdateEdgeWorker($input: UpdateEdgeWorkerInput!) {
				updateEdgeWorker(input: $input) {
					${ EDGE_WORKER_FIELDS }
				}
			}
		`,
		variables: { input: { environmentId: envId, edgeWorkerId, ...input } },
	} );

	return requireMutationPayload( 'updateEdgeWorker', response.data?.updateEdgeWorker );
}

export interface EdgeWorkerValidationResult {
	valid: boolean;
	phases: EdgeWorkerPhase[];
	errors: string[];
}

/**
 * Server-side dry-run validation of a compiled worker. Persists nothing — used
 * to fail fast before the real create/update upload.
 */
export async function validateEdgeWorker(
	envId: number,
	wasmBinary: string
): Promise< EdgeWorkerValidationResult > {
	const api = API();
	const response = await api.mutate< {
		validateEdgeWorker: EdgeWorkerValidationResult | null;
	} >( {
		mutation: gql`
			mutation ValidateEdgeWorker($input: ValidateEdgeWorkerInput!) {
				validateEdgeWorker(input: $input) {
					valid
					phases
					errors
				}
			}
		`,
		variables: { input: { environmentId: envId, wasmBinary } },
	} );

	return requireMutationPayload( 'validateEdgeWorker', response.data?.validateEdgeWorker );
}

export async function setEdgeWorkerActive(
	envId: number,
	edgeWorkerId: number,
	active: boolean
): Promise< EdgeWorker > {
	const api = API();
	const response = await api.mutate< { setEdgeWorkerActive: EdgeWorker | null } >( {
		mutation: gql`
			mutation SetEdgeWorkerActive($input: SetEdgeWorkerActiveInput!) {
				setEdgeWorkerActive(input: $input) {
					${ EDGE_WORKER_FIELDS }
				}
			}
		`,
		variables: { input: { environmentId: envId, edgeWorkerId, active } },
	} );

	return requireMutationPayload( 'setEdgeWorkerActive', response.data?.setEdgeWorkerActive );
}

export async function deleteEdgeWorker( envId: number, edgeWorkerId: number ): Promise< void > {
	const api = API();
	const response = await api.mutate< { deleteEdgeWorker: boolean | null } >( {
		mutation: gql`
			mutation DeleteEdgeWorker($input: DeleteEdgeWorkerInput!) {
				deleteEdgeWorker(input: $input)
			}
		`,
		variables: { input: { environmentId: envId, edgeWorkerId } },
	} );

	if ( response.data?.deleteEdgeWorker !== true ) {
		throw new UserError( 'deleteEdgeWorker did not confirm deletion.' );
	}
}
