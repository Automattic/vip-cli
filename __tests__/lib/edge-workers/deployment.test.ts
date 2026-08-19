import {
	createEdgeWorker,
	listEdgeWorkers,
	setEdgeWorkerActive,
	updateEdgeWorker,
	validateEdgeWorker,
} from '../../../src/lib/api/edge-workers';
import { buildWorker, readPrebuiltWorker, readWorkerSource } from '../../../src/lib/edge-workers';
import {
	applyEdgeWorkerDeploymentPlan,
	DeploymentApplyError,
	deploymentPlanRows,
	prepareEdgeWorkerDeploymentPlan,
} from '../../../src/lib/edge-workers/deployment';

import type { EdgeWorker } from '../../../src/lib/edge-workers/types';

jest.mock( '../../../src/lib/api/edge-workers', () => ( {
	createEdgeWorker: jest.fn(),
	listEdgeWorkers: jest.fn(),
	setEdgeWorkerActive: jest.fn(),
	updateEdgeWorker: jest.fn(),
	validateEdgeWorker: jest.fn(),
} ) );

jest.mock( '../../../src/lib/edge-workers', () => ( {
	buildWorker: jest.fn(),
	readPrebuiltWorker: jest.fn(),
	readWorkerSource: jest.fn(),
} ) );

const location = { operator: 'starts_with' as const, value: '/api/' };
const replacementLocation = { operator: 'equals' as const, value: '/checkout' };

const remoteWorker = ( overrides: Partial< EdgeWorker > = {} ): EdgeWorker => ( {
	id: 42,
	name: 'headers',
	location,
	phases: [ 'client_response' ],
	onFailure: 'continue',
	active: true,
	createdAt: '2026-08-18T00:00:00Z',
	updatedAt: '2026-08-18T00:00:00Z',
	...overrides,
} );

const localWorker = ( manifest: Record< string, unknown > = {} ) => ( {
	dir: '/project/workers/headers',
	manifest: {
		name: 'headers',
		entry: 'assembly/index.ts',
		on_failure: 'continue' as const,
		...manifest,
	},
} );

const options = ( workers = [ localWorker() ] ) => ( {
	appId: 1,
	envId: 3,
	projectDir: '/project',
	workers,
	skipBuild: false,
	skipValidate: false,
	skipSource: false,
	enableAfterDeploy: false,
} );

describe( 'prepareEdgeWorkerDeploymentPlan()', () => {
	beforeEach( () => {
		jest.clearAllMocks();
		jest.mocked( listEdgeWorkers ).mockResolvedValue( [] );
		jest.mocked( buildWorker ).mockReturnValue( {
			wasmPath: '/project/build/headers.wasm',
			base64: 'V0FTTQ==',
			sizeBytes: 5,
		} );
		jest.mocked( readWorkerSource ).mockReturnValue( 'source code' );
		jest.mocked( validateEdgeWorker ).mockResolvedValue( {
			valid: true,
			phases: [ 'client_response' ],
			errors: [],
		} );
	} );

	it( 'preserves an existing location when the update manifest omits location', async () => {
		jest.mocked( listEdgeWorkers ).mockResolvedValue( [ remoteWorker() ] );

		const plan = await prepareEdgeWorkerDeploymentPlan( options() );

		expect( plan[ 0 ].action ).toBe( 'update' );
		expect( plan[ 0 ].input ).not.toHaveProperty( 'location' );
		expect( plan[ 0 ].currentLocation ).toEqual( location );
		expect( plan[ 0 ].proposedLocation ).toEqual( location );
	} );

	it( 'clears an existing location when the update manifest sets location to null', async () => {
		jest.mocked( listEdgeWorkers ).mockResolvedValue( [ remoteWorker() ] );

		const plan = await prepareEdgeWorkerDeploymentPlan(
			options( [ localWorker( { location: null } ) ] )
		);

		expect( plan[ 0 ].input ).toEqual(
			expect.objectContaining( {
				location: null,
			} )
		);
		expect( plan[ 0 ].currentLocation ).toEqual( location );
		expect( plan[ 0 ].proposedLocation ).toBeNull();
	} );

	it( 'replaces an existing location when the update manifest supplies an object', async () => {
		jest.mocked( listEdgeWorkers ).mockResolvedValue( [ remoteWorker() ] );

		const plan = await prepareEdgeWorkerDeploymentPlan(
			options( [ localWorker( { location: replacementLocation } ) ] )
		);

		expect( plan[ 0 ].input ).toEqual(
			expect.objectContaining( {
				location: replacementLocation,
			} )
		);
		expect( plan[ 0 ].proposedLocation ).toEqual( replacementLocation );
	} );

	it.each( [
		[ 'absent', {} ],
		[ 'null', { location: null } ],
	] )( 'treats a %s location as all requests on create', async ( _label, manifest ) => {
		const plan = await prepareEdgeWorkerDeploymentPlan( options( [ localWorker( manifest ) ] ) );

		expect( plan[ 0 ].action ).toBe( 'create' );
		expect( plan[ 0 ].input ).not.toHaveProperty( 'location' );
		expect( plan[ 0 ].currentLocation ).toBeNull();
		expect( plan[ 0 ].proposedLocation ).toBeNull();
	} );

	it( 'omits source on create when source storage is skipped', async () => {
		const plan = await prepareEdgeWorkerDeploymentPlan( {
			...options(),
			skipSource: true,
		} );

		expect( readWorkerSource ).not.toHaveBeenCalled();
		expect( plan[ 0 ].sourceMode ).toBe( 'omit' );
		expect( plan[ 0 ].input ).not.toHaveProperty( 'source' );
	} );

	it( 'preserves stored source on update when source storage is skipped', async () => {
		jest.mocked( listEdgeWorkers ).mockResolvedValue( [ remoteWorker() ] );

		const plan = await prepareEdgeWorkerDeploymentPlan( {
			...options(),
			skipSource: true,
		} );

		expect( readWorkerSource ).not.toHaveBeenCalled();
		expect( plan[ 0 ].sourceMode ).toBe( 'preserve' );
		expect( plan[ 0 ].input ).not.toHaveProperty( 'source' );
	} );

	it( 'stores an empty source file on update when source storage is enabled', async () => {
		jest.mocked( listEdgeWorkers ).mockResolvedValue( [ remoteWorker() ] );
		jest.mocked( readWorkerSource ).mockReturnValue( '' );

		const plan = await prepareEdgeWorkerDeploymentPlan( options() );

		expect( plan[ 0 ].sourceMode ).toBe( 'store' );
		expect( plan[ 0 ].input ).toHaveProperty( 'source', '' );
	} );

	it( 'aborts preparation when source cannot be read', async () => {
		jest.mocked( readWorkerSource ).mockImplementation( () => {
			throw new Error( 'Could not read worker source.' );
		} );

		await expect( prepareEdgeWorkerDeploymentPlan( options() ) ).rejects.toThrow(
			'Could not read worker source.'
		);
		expect( createEdgeWorker ).not.toHaveBeenCalled();
		expect( updateEdgeWorker ).not.toHaveBeenCalled();
	} );

	it( 'requires explicit successful validation and never applies during preparation', async () => {
		jest.mocked( validateEdgeWorker ).mockResolvedValue( {
			valid: false,
			phases: [],
			errors: [ 'missing alloc export' ],
		} );

		await expect( prepareEdgeWorkerDeploymentPlan( options() ) ).rejects.toThrow(
			'worker "headers" failed validation: missing alloc export'
		);
		expect( createEdgeWorker ).not.toHaveBeenCalled();
		expect( updateEdgeWorker ).not.toHaveBeenCalled();
	} );

	it( 'loads remote workers once and prepares every selected worker', async () => {
		const secondWorker = localWorker( { name: 'redirects' } );
		jest
			.mocked( buildWorker )
			.mockReturnValueOnce( {
				wasmPath: '/project/build/headers.wasm',
				base64: 'SEVBREVSUw==',
				sizeBytes: 7,
			} )
			.mockReturnValueOnce( {
				wasmPath: '/project/build/redirects.wasm',
				base64: 'UkVESVJFQ1RT',
				sizeBytes: 9,
			} );

		const plan = await prepareEdgeWorkerDeploymentPlan(
			options( [ localWorker(), secondWorker ] )
		);

		expect( listEdgeWorkers ).toHaveBeenCalledTimes( 1 );
		expect( listEdgeWorkers ).toHaveBeenCalledWith( 1, 3 );
		expect( plan.map( item => item.worker.manifest.name ) ).toEqual( [ 'headers', 'redirects' ] );
		expect( buildWorker ).toHaveBeenCalledTimes( 2 );
		expect( validateEdgeWorker ).toHaveBeenCalledTimes( 2 );
		expect( readWorkerSource ).toHaveBeenCalledTimes( 2 );
		expect( createEdgeWorker ).not.toHaveBeenCalled();
		expect( updateEdgeWorker ).not.toHaveBeenCalled();
	} );

	it( 'does no preparation or mutation when the remote read state is malformed', async () => {
		jest
			.mocked( listEdgeWorkers )
			.mockRejectedValue( new Error( 'EdgeWorkers query returned an invalid response.' ) );

		await expect( prepareEdgeWorkerDeploymentPlan( options() ) ).rejects.toThrow(
			/invalid response/
		);
		expect( buildWorker ).not.toHaveBeenCalled();
		expect( readPrebuiltWorker ).not.toHaveBeenCalled();
		expect( validateEdgeWorker ).not.toHaveBeenCalled();
		expect( readWorkerSource ).not.toHaveBeenCalled();
		expect( createEdgeWorker ).not.toHaveBeenCalled();
		expect( updateEdgeWorker ).not.toHaveBeenCalled();
	} );

	it( 'uses prebuilt artifacts and records skipped validation when requested', async () => {
		jest.mocked( readPrebuiltWorker ).mockReturnValue( {
			wasmPath: '/project/build/headers.wasm',
			base64: 'V0FTTQ==',
			sizeBytes: 5,
		} );

		const plan = await prepareEdgeWorkerDeploymentPlan( {
			...options(),
			skipBuild: true,
			skipValidate: true,
		} );

		expect( buildWorker ).not.toHaveBeenCalled();
		expect( readPrebuiltWorker ).toHaveBeenCalled();
		expect( validateEdgeWorker ).not.toHaveBeenCalled();
		expect( plan[ 0 ].validation ).toBe( 'skipped' );
		expect( plan[ 0 ].phases ).toEqual( [] );
	} );
} );

describe( 'deploymentPlanRows()', () => {
	beforeEach( () => {
		jest.clearAllMocks();
		jest.mocked( listEdgeWorkers ).mockResolvedValue( [ remoteWorker() ] );
		jest.mocked( buildWorker ).mockReturnValue( {
			wasmPath: '/project/build/headers.wasm',
			base64: 'V0FTTQ==',
			sizeBytes: 128,
		} );
		jest.mocked( readWorkerSource ).mockReturnValue( 'source code' );
		jest.mocked( validateEdgeWorker ).mockResolvedValue( {
			valid: true,
			phases: [ 'client_response' ],
			errors: [],
		} );
	} );

	it( 'renders a stable row from the exact prepared update item', async () => {
		const plan = await prepareEdgeWorkerDeploymentPlan(
			options( [ localWorker( { location: null } ) ] )
		);

		expect( deploymentPlanRows( plan ) ).toEqual( [
			{
				worker: 'headers',
				action: 'update',
				current_active: 'active',
				final_active: 'active',
				current_scope: 'starts_with "/api/"',
				proposed_scope: 'all requests',
				validation: 'passed',
				phases: 'client_response',
				bytes: '128',
				source: 'store',
			},
		] );
	} );

	it( 'renders create defaults and all validated phases without mutating the plan', async () => {
		jest.mocked( listEdgeWorkers ).mockResolvedValue( [] );
		jest.mocked( validateEdgeWorker ).mockResolvedValue( {
			valid: true,
			phases: [ 'client_request', 'origin_request' ],
			errors: [],
		} );
		const plan = await prepareEdgeWorkerDeploymentPlan( {
			...options(),
			skipSource: true,
		} );
		const itemBeforePreview = { ...plan[ 0 ] };

		expect( deploymentPlanRows( plan ) ).toEqual( [
			{
				worker: 'headers',
				action: 'create',
				current_active: 'new',
				final_active: 'inactive',
				current_scope: 'all requests',
				proposed_scope: 'all requests',
				validation: 'passed',
				phases: 'client_request, origin_request',
				bytes: '128',
				source: 'omit',
			},
		] );
		expect( plan[ 0 ] ).toMatchObject( {
			enableAfterDeploy: false,
			intendedActive: false,
		} );
		expect( plan[ 0 ] ).toEqual( itemBeforePreview );
	} );

	it( 'renders an active final state for a create when enable is requested', async () => {
		jest.mocked( listEdgeWorkers ).mockResolvedValue( [] );

		const plan = await prepareEdgeWorkerDeploymentPlan( {
			...options(),
			enableAfterDeploy: true,
		} );
		const rows = deploymentPlanRows( plan );

		expect( plan[ 0 ] ).toMatchObject( { enableAfterDeploy: true, intendedActive: true } );
		expect( rows ).toEqual( [
			expect.objectContaining( {
				current_active: 'new',
				final_active: 'active',
			} ),
		] );
	} );

	it( 'renders an active final state for an inactive update when enable is requested', async () => {
		jest.mocked( listEdgeWorkers ).mockResolvedValue( [ remoteWorker( { active: false } ) ] );

		const plan = await prepareEdgeWorkerDeploymentPlan( {
			...options(),
			enableAfterDeploy: true,
		} );
		const rows = deploymentPlanRows( plan );

		expect( plan[ 0 ] ).toMatchObject( { enableAfterDeploy: true, intendedActive: true } );
		expect( rows ).toEqual( [
			expect.objectContaining( {
				current_active: 'inactive',
				final_active: 'active',
			} ),
		] );
	} );

	it( 'keeps an already-active update active when enable is requested', async () => {
		const plan = await prepareEdgeWorkerDeploymentPlan( {
			...options(),
			enableAfterDeploy: true,
		} );
		const rows = deploymentPlanRows( plan );

		expect( plan[ 0 ] ).toMatchObject( { enableAfterDeploy: true, intendedActive: true } );
		expect( rows ).toEqual( [
			expect.objectContaining( {
				current_active: 'active',
				final_active: 'active',
			} ),
		] );
	} );

	it( 'neutralizes terminal controls in remote preview fields', async () => {
		jest.mocked( listEdgeWorkers ).mockResolvedValue( [
			remoteWorker( {
				location: { operator: 'starts_with', value: '/api/\u001b[2J' },
			} ),
		] );
		jest.mocked( validateEdgeWorker ).mockResolvedValue( {
			valid: true,
			phases: [ 'client_response\u001b[31m' as never ],
			errors: [],
		} );

		const [ row ] = deploymentPlanRows( await prepareEdgeWorkerDeploymentPlan( options() ) );
		const rendered = Object.values( row ).join( '|' );

		expect( rendered ).not.toContain( '\u001b' );
		expect( rendered ).toContain( String.raw`\u001b` );
	} );
} );

describe( 'applyEdgeWorkerDeploymentPlan()', () => {
	beforeEach( () => {
		jest.clearAllMocks();
		jest.mocked( buildWorker ).mockImplementation( ( _projectDir, worker ) => ( {
			wasmPath: `/project/build/${ worker.manifest.name }.wasm`,
			base64: `binary-${ worker.manifest.name }`,
			sizeBytes: worker.manifest.name.length,
		} ) );
		jest
			.mocked( readWorkerSource )
			.mockImplementation( worker => `source-${ worker.manifest.name }` );
		jest.mocked( validateEdgeWorker ).mockResolvedValue( {
			valid: true,
			phases: [ 'client_response' ],
			errors: [],
		} );
	} );

	it( 'applies create and update items sequentially and reports each resolved result', async () => {
		const redirects = localWorker( { name: 'redirects', location: null } );
		const existingRedirects = remoteWorker( { id: 84, name: 'redirects', active: false } );
		jest.mocked( listEdgeWorkers ).mockResolvedValue( [ existingRedirects ] );
		const plan = await prepareEdgeWorkerDeploymentPlan( options( [ localWorker(), redirects ] ) );
		const created = remoteWorker( { id: 7, location: null, active: false } );
		const updated = remoteWorker( { id: 84, name: 'redirects', location: null, active: false } );
		const order: string[] = [];
		jest.mocked( createEdgeWorker ).mockImplementation( () => {
			order.push( 'create' );
			return Promise.resolve( created );
		} );
		jest.mocked( updateEdgeWorker ).mockImplementation( () => {
			order.push( 'update' );
			return Promise.resolve( updated );
		} );
		const planBeforeApply = plan.map( item => ( { ...item, input: { ...item.input } } ) );

		await applyEdgeWorkerDeploymentPlan( 3, plan, ( item, result ) => {
			order.push( `applied:${ item.worker.manifest.name }:${ result.id }` );
		} );

		expect( createEdgeWorker ).toHaveBeenCalledWith( 3, plan[ 0 ].input );
		expect( updateEdgeWorker ).toHaveBeenCalledWith( 3, 84, plan[ 1 ].input );
		expect( setEdgeWorkerActive ).not.toHaveBeenCalled();
		expect( order ).toEqual( [ 'create', 'applied:headers:7', 'update', 'applied:redirects:84' ] );
		expect( plan ).toEqual( planBeforeApply );
	} );

	it( 'enables an inactive create after upload and reports the activated worker', async () => {
		jest.mocked( listEdgeWorkers ).mockResolvedValue( [] );
		const plan = await prepareEdgeWorkerDeploymentPlan( {
			...options(),
			enableAfterDeploy: true,
		} );
		const uploaded = remoteWorker( { id: 7, location: null, active: false } );
		const enabled = remoteWorker( { id: 7, location: null, active: true } );
		const order: string[] = [];
		jest.mocked( createEdgeWorker ).mockImplementation( () => {
			order.push( 'create' );
			return Promise.resolve( uploaded );
		} );
		jest.mocked( setEdgeWorkerActive ).mockImplementation( () => {
			order.push( 'enable' );
			return Promise.resolve( enabled );
		} );
		const onApplied = jest.fn( ( _item: unknown, result: EdgeWorker ) => {
			order.push( `applied:headers:${ result.active }` );
		} );

		await applyEdgeWorkerDeploymentPlan( 3, plan, onApplied );

		expect( setEdgeWorkerActive ).toHaveBeenCalledWith( 3, 7, true );
		expect( onApplied ).toHaveBeenCalledWith( plan[ 0 ], enabled );
		expect( order ).toEqual( [ 'create', 'enable', 'applied:headers:true' ] );
	} );

	it( 'enables an inactive update after upload and reports the activated worker', async () => {
		const existing = remoteWorker( { active: false } );
		jest.mocked( listEdgeWorkers ).mockResolvedValue( [ existing ] );
		const plan = await prepareEdgeWorkerDeploymentPlan( {
			...options(),
			enableAfterDeploy: true,
		} );
		const uploaded = remoteWorker( { active: false } );
		const enabled = remoteWorker( { active: true } );
		const order: string[] = [];
		jest.mocked( updateEdgeWorker ).mockImplementation( () => {
			order.push( 'update' );
			return Promise.resolve( uploaded );
		} );
		jest.mocked( setEdgeWorkerActive ).mockImplementation( () => {
			order.push( 'enable' );
			return Promise.resolve( enabled );
		} );
		const onApplied = jest.fn( ( _item: unknown, result: EdgeWorker ) => {
			order.push( `applied:headers:${ result.active }` );
		} );

		await applyEdgeWorkerDeploymentPlan( 3, plan, onApplied );

		expect( setEdgeWorkerActive ).toHaveBeenCalledWith( 3, 42, true );
		expect( onApplied ).toHaveBeenCalledWith( plan[ 0 ], enabled );
		expect( order ).toEqual( [ 'update', 'enable', 'applied:headers:true' ] );
	} );

	it( 'does not redundantly enable an update that remains active after upload', async () => {
		const existing = remoteWorker( { active: true } );
		jest.mocked( listEdgeWorkers ).mockResolvedValue( [ existing ] );
		const plan = await prepareEdgeWorkerDeploymentPlan( {
			...options(),
			enableAfterDeploy: true,
		} );
		const uploaded = remoteWorker( { active: true } );
		jest.mocked( updateEdgeWorker ).mockResolvedValue( uploaded );
		const onApplied = jest.fn();

		await applyEdgeWorkerDeploymentPlan( 3, plan, onApplied );

		expect( setEdgeWorkerActive ).not.toHaveBeenCalled();
		expect( onApplied ).toHaveBeenCalledWith( plan[ 0 ], uploaded );
	} );

	it( 'reports applied, failed, and unapplied names without retry or rollback', async () => {
		const workers = [ 'alpha', 'beta', 'gamma' ].map( name => localWorker( { name } ) );
		jest.mocked( listEdgeWorkers ).mockResolvedValue( [] );
		const plan = await prepareEdgeWorkerDeploymentPlan( options( workers ) );
		const cause = new Error( 'request timed out' );
		jest
			.mocked( createEdgeWorker )
			.mockResolvedValueOnce( remoteWorker( { id: 1, name: 'alpha', active: false } ) )
			.mockRejectedValueOnce( cause );
		const onApplied = jest.fn();

		const application = applyEdgeWorkerDeploymentPlan( 3, plan, onApplied );

		await expect( application ).rejects.toBeInstanceOf( DeploymentApplyError );
		await expect( application ).rejects.toMatchObject( {
			stage: 'upload',
			appliedNames: [ 'alpha' ],
			failedName: 'beta',
			unappliedNames: [ 'gamma' ],
			uploadCompleted: false,
			activeAfterUpload: null,
			cause,
		} );
		expect( createEdgeWorker ).toHaveBeenCalledTimes( 2 );
		expect( updateEdgeWorker ).not.toHaveBeenCalled();
		expect( setEdgeWorkerActive ).not.toHaveBeenCalled();
		expect( onApplied ).toHaveBeenCalledTimes( 1 );
		expect( onApplied ).toHaveBeenCalledWith(
			plan[ 0 ],
			expect.objectContaining( { name: 'alpha' } )
		);
	} );

	it( 'reports an ambiguous enable failure after upload and stops later workers', async () => {
		const workers = [ 'alpha', 'beta', 'gamma' ].map( name => localWorker( { name } ) );
		jest.mocked( listEdgeWorkers ).mockResolvedValue( [] );
		const plan = await prepareEdgeWorkerDeploymentPlan( {
			...options( workers ),
			enableAfterDeploy: true,
		} );
		const alphaUploaded = remoteWorker( { id: 1, name: 'alpha', active: false } );
		const alphaEnabled = remoteWorker( { id: 1, name: 'alpha', active: true } );
		const betaUploaded = remoteWorker( { id: 2, name: 'beta', active: false } );
		const cause = new Error( 'request timed out' );
		jest
			.mocked( createEdgeWorker )
			.mockResolvedValueOnce( alphaUploaded )
			.mockResolvedValueOnce( betaUploaded );
		jest
			.mocked( setEdgeWorkerActive )
			.mockResolvedValueOnce( alphaEnabled )
			.mockRejectedValueOnce( cause );
		const onApplied = jest.fn();

		const application = applyEdgeWorkerDeploymentPlan( 3, plan, onApplied );

		await expect( application ).rejects.toMatchObject( {
			stage: 'enable',
			appliedNames: [ 'alpha' ],
			failedName: 'beta',
			unappliedNames: [ 'gamma' ],
			uploadCompleted: true,
			activeAfterUpload: false,
			cause,
		} );
		expect( createEdgeWorker ).toHaveBeenCalledTimes( 2 );
		expect( setEdgeWorkerActive ).toHaveBeenCalledTimes( 2 );
		expect( onApplied ).toHaveBeenCalledTimes( 1 );
		expect( onApplied ).toHaveBeenCalledWith( plan[ 0 ], alphaEnabled );
	} );
} );
