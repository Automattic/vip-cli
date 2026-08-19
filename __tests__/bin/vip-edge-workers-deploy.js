import { edgeWorkersDeployCommand } from '../../src/bin/vip-edge-workers-deploy';
import command from '../../src/lib/cli/command';
import * as exit from '../../src/lib/cli/exit';
import * as format from '../../src/lib/cli/format';
import * as confirmation from '../../src/lib/edge-workers/confirmation';
import * as deployment from '../../src/lib/edge-workers/deployment';
import * as project from '../../src/lib/edge-workers/project';
import { confirm } from '../../src/lib/envvar/input';
import * as tracker from '../../src/lib/tracker';

jest.spyOn( console, 'log' ).mockImplementation( () => {} );
jest.spyOn( exit, 'withError' ).mockImplementation( () => {
	throw 'EXIT_WITH_ERROR';
} );

jest.mock( '../../src/lib/cli/command', () => {
	const options = [];
	const commandMock = {
		argv: () => commandMock,
		examples: () => commandMock,
		option: ( ...args ) => {
			options.push( args );
			return commandMock;
		},
	};
	const createCommand = jest.fn( () => commandMock );
	createCommand.options = options;
	return createCommand;
} );

jest.mock( '../../src/lib/cli/format', () => ( {
	formatData: jest.fn(),
} ) );

jest.mock( '../../src/lib/envvar/input', () => ( {
	confirm: jest.fn(),
} ) );

jest.mock( '../../src/lib/edge-workers/confirmation', () => {
	const actual = jest.requireActual( '../../src/lib/edge-workers/confirmation' );
	return {
		...actual,
		isInteractiveEdgeWorkers: jest.fn(),
	};
} );

jest.mock( '../../src/lib/edge-workers/deployment', () => {
	const actual = jest.requireActual( '../../src/lib/edge-workers/deployment' );
	return {
		...actual,
		prepareEdgeWorkerDeploymentPlan: jest.fn(),
		deploymentPlanRows: jest.fn(),
		applyEdgeWorkerDeploymentPlan: jest.fn(),
	};
} );

jest.mock( '../../src/lib/edge-workers/project', () => ( {
	resolveProjectDir: jest.fn(),
	findWorker: jest.fn(),
	discoverWorkers: jest.fn(),
} ) );

jest.mock( '../../src/lib/tracker', () => ( {
	trackEventWithEnv: jest.fn(),
} ) );

const opts = {
	app: { id: 1, name: 'example-app' },
	env: { id: 3, type: 'production' },
	skipBuild: true,
	skipValidate: false,
	skipSource: false,
	skipConfirmation: false,
	enable: false,
};

const worker = name => ( {
	dir: `/project/workers/${ name }`,
	manifest: { name, entry: 'assembly/index.ts' },
} );

const planItem = ( name, action = 'create' ) => ( {
	action,
	worker: worker( name ),
	existing: action === 'update' ? { id: 42, name, active: true } : null,
	artifact: {
		wasmPath: `/project/build/${ name }.wasm`,
		base64: `binary-${ name }`,
		sizeBytes: name.length,
	},
	validation: 'passed',
	phases: [ 'client_response' ],
	input: { name, wasmBinary: `binary-${ name }` },
	currentLocation: null,
	proposedLocation: null,
	sourceMode: 'store',
	enableAfterDeploy: false,
	intendedActive: action === 'update',
} );

describe( 'edgeWorkersDeployCommand()', () => {
	beforeEach( () => {
		jest.clearAllMocks();
		project.resolveProjectDir.mockReturnValue( '/project' );
		project.findWorker.mockImplementation( ( _projectDir, name ) => worker( name ) );
		project.discoverWorkers.mockReturnValue( [ worker( 'alpha' ), worker( 'beta' ) ] );
		deployment.prepareEdgeWorkerDeploymentPlan.mockResolvedValue( [ planItem( 'headers' ) ] );
		deployment.deploymentPlanRows.mockReturnValue( [ { worker: 'headers' } ] );
		format.formatData.mockReturnValue( 'PLAN TABLE' );
		deployment.applyEdgeWorkerDeploymentPlan.mockResolvedValue();
		confirmation.isInteractiveEdgeWorkers.mockReturnValue( true );
		confirm.mockResolvedValue( true );
	} );

	it( 'prepares the selected worker with the command options', async () => {
		await edgeWorkersDeployCommand( [ 'headers' ], opts );

		expect( project.findWorker ).toHaveBeenCalledWith( '/project', 'headers' );
		expect( project.discoverWorkers ).not.toHaveBeenCalled();
		expect( deployment.prepareEdgeWorkerDeploymentPlan ).toHaveBeenCalledWith( {
			appId: 1,
			envId: 3,
			projectDir: '/project',
			workers: [
				expect.objectContaining( { manifest: expect.objectContaining( { name: 'headers' } ) } ),
			],
			skipBuild: true,
			skipValidate: false,
			skipSource: false,
			enableAfterDeploy: false,
		} );
	} );

	it( 'registers deploy enable as an explicit default-false option', () => {
		expect( command.options ).toContainEqual( [
			'enable',
			'Enable each deployed worker after a successful upload.',
			false,
		] );
	} );

	it( 'passes activation intent when preparing a named worker', async () => {
		await edgeWorkersDeployCommand( [ 'headers' ], { ...opts, enable: true } );

		expect( deployment.prepareEdgeWorkerDeploymentPlan ).toHaveBeenCalledWith(
			expect.objectContaining( { enableAfterDeploy: true } )
		);
	} );

	it( 'explains create and update source behavior in --skip-source help', () => {
		expect( command.options ).toContainEqual( [
			'skip-source',
			'Do not store source on create; preserve stored source on update.',
			false,
		] );
	} );

	it( 'prepares every discovered worker for --all', async () => {
		await edgeWorkersDeployCommand( [], { ...opts, all: true, enable: true } );

		expect( project.discoverWorkers ).toHaveBeenCalledWith( '/project' );
		expect( project.findWorker ).not.toHaveBeenCalled();
		expect( deployment.prepareEdgeWorkerDeploymentPlan ).toHaveBeenCalledWith(
			expect.objectContaining( {
				workers: [
					expect.objectContaining( { manifest: expect.objectContaining( { name: 'alpha' } ) } ),
					expect.objectContaining( { manifest: expect.objectContaining( { name: 'beta' } ) } ),
				],
				enableAfterDeploy: true,
			} )
		);
	} );

	it( 'rejects a worker name combined with --all before project resolution', async () => {
		await expect( edgeWorkersDeployCommand( [ 'headers' ], { ...opts, all: true } ) ).rejects.toBe(
			'EXIT_WITH_ERROR'
		);

		expect( exit.withError ).toHaveBeenCalledWith(
			'Failed to deploy edge worker: Supply either a worker name or --all, not both.'
		);
		expect( project.resolveProjectDir ).not.toHaveBeenCalled();
		expect( deployment.prepareEdgeWorkerDeploymentPlan ).not.toHaveBeenCalled();
		expect( deployment.applyEdgeWorkerDeploymentPlan ).not.toHaveBeenCalled();
	} );

	it( 'prepares, previews, confirms exact production targets, then applies the same items', async () => {
		const plan = [ planItem( 'alpha' ), planItem( 'beta', 'update' ) ];
		const rows = [ { worker: 'alpha' }, { worker: 'beta' } ];
		const order = [];
		deployment.prepareEdgeWorkerDeploymentPlan.mockResolvedValue( plan );
		deployment.deploymentPlanRows.mockImplementation( received => {
			expect( received ).toBe( plan );
			order.push( 'rows' );
			return rows;
		} );
		format.formatData.mockImplementation( ( received, outputFormat ) => {
			expect( received ).toBe( rows );
			expect( outputFormat ).toBe( 'table' );
			order.push( 'format' );
			return 'PLAN TABLE';
		} );
		console.log.mockImplementationOnce( value => {
			expect( value ).toBe( 'PLAN TABLE' );
			order.push( 'preview' );
		} );
		confirm.mockImplementation( async message => {
			expect( message ).toBe(
				'Deploy and enable 2 edge workers (alpha, beta) on example-app.production?'
			);
			order.push( 'confirm' );
			return true;
		} );
		deployment.applyEdgeWorkerDeploymentPlan.mockImplementation( async ( envId, received ) => {
			expect( envId ).toBe( 3 );
			expect( received ).toBe( plan );
			order.push( 'apply' );
		} );

		await edgeWorkersDeployCommand( [], { ...opts, all: true, enable: true } );

		expect( order ).toEqual( [ 'rows', 'format', 'preview', 'confirm', 'apply' ] );
		expect( confirmation.isInteractiveEdgeWorkers ).toHaveBeenCalledWith( {
			...opts,
			all: true,
			enable: true,
		} );
	} );

	it( 'previews and applies non-production deployments without prompting', async () => {
		await edgeWorkersDeployCommand( [ 'headers' ], {
			...opts,
			env: { id: 3, type: 'develop' },
		} );

		expect( console.log ).toHaveBeenCalledWith( 'PLAN TABLE' );
		expect( confirm ).not.toHaveBeenCalled();
		expect( deployment.applyEdgeWorkerDeploymentPlan ).toHaveBeenCalled();
	} );

	it( 'previews but refuses non-interactive production before applying', async () => {
		confirmation.isInteractiveEdgeWorkers.mockReturnValue( false );

		await expect( edgeWorkersDeployCommand( [ 'headers' ], opts ) ).rejects.toBe(
			'EXIT_WITH_ERROR'
		);

		expect( console.log ).toHaveBeenCalledWith( 'PLAN TABLE' );
		expect( confirm ).not.toHaveBeenCalled();
		expect( deployment.applyEdgeWorkerDeploymentPlan ).not.toHaveBeenCalled();
		expect( exit.withError ).toHaveBeenCalledWith(
			expect.stringMatching( /Refusing to deploy.*production/ )
		);
	} );

	it( 'refuses non-interactive production deploy enable without the existing bypass', async () => {
		confirmation.isInteractiveEdgeWorkers.mockReturnValue( false );

		await expect(
			edgeWorkersDeployCommand( [ 'headers' ], { ...opts, enable: true } )
		).rejects.toBe( 'EXIT_WITH_ERROR' );

		expect( deployment.applyEdgeWorkerDeploymentPlan ).not.toHaveBeenCalled();
		expect( exit.withError ).toHaveBeenCalledWith(
			expect.stringContaining( 'Refusing to deploy and enable edge workers in production' )
		);
		expect( exit.withError ).toHaveBeenCalledWith(
			expect.stringContaining( 'Pass --skip-confirmation' )
		);
	} );

	it( 'allows explicit production confirmation bypass without prompting', async () => {
		confirmation.isInteractiveEdgeWorkers.mockReturnValue( false );

		await edgeWorkersDeployCommand( [ 'headers' ], { ...opts, skipConfirmation: true } );

		expect( confirm ).not.toHaveBeenCalled();
		expect( deployment.applyEdgeWorkerDeploymentPlan ).toHaveBeenCalled();
	} );

	it( 'prints success output only from the applied callback and then tracks success', async () => {
		const item = planItem( 'headers', 'update' );
		item.worker.dir = '/private/customer/SENTINEL_SOURCE_PATH';
		item.input.source = 'SENTINEL_SOURCE_TEXT';
		deployment.prepareEdgeWorkerDeploymentPlan.mockResolvedValue( [ item ] );
		deployment.applyEdgeWorkerDeploymentPlan.mockImplementation(
			async ( _envId, items, onApplied ) => {
				expect( tracker.trackEventWithEnv ).not.toHaveBeenCalledWith(
					1,
					3,
					'edge_workers_deploy_command_success',
					expect.anything()
				);
				await onApplied( items[ 0 ], {
					id: 42,
					name: 'headers',
					phases: [ 'client_response' ],
					active: true,
				} );
			}
		);

		await edgeWorkersDeployCommand( [ 'headers' ], opts );

		expect( console.log ).toHaveBeenCalledWith(
			'✓ updated "headers"; remains active (7 bytes, phases: client_response)'
		);
		expect( tracker.trackEventWithEnv ).toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_deploy_command_success',
			{ count: 1, enable: false, activeCount: 1 }
		);
		const outputOrder = console.log.mock.invocationCallOrder.at( -1 );
		const telemetryOrder = tracker.trackEventWithEnv.mock.invocationCallOrder.at( -1 );
		expect( outputOrder ).toBeLessThan( telemetryOrder );
		const successTelemetry = tracker.trackEventWithEnv.mock.calls.find(
			( [ , , eventName ] ) => eventName === 'edge_workers_deploy_command_success'
		);
		expect( JSON.stringify( successTelemetry ) ).not.toContain( 'SENTINEL_SOURCE_PATH' );
		expect( JSON.stringify( successTelemetry ) ).not.toContain( 'SENTINEL_SOURCE_TEXT' );
	} );

	it( 'reports a create with enable from the final activated result', async () => {
		const item = planItem( 'headers' );
		deployment.prepareEdgeWorkerDeploymentPlan.mockResolvedValue( [ item ] );
		deployment.applyEdgeWorkerDeploymentPlan.mockImplementation(
			async ( _envId, items, onApplied ) => {
				await onApplied( items[ 0 ], {
					id: 42,
					name: 'headers',
					phases: [ 'client_response' ],
					active: true,
				} );
			}
		);

		await edgeWorkersDeployCommand( [ 'headers' ], { ...opts, enable: true } );

		expect( console.log ).toHaveBeenCalledWith(
			'✓ created "headers" and enabled it (7 bytes, phases: client_response)'
		);
		expect( console.log ).not.toHaveBeenCalledWith( expect.stringMatching( /^Review created/ ) );
	} );

	it( 'reports an upload-only create as inactive and prints one review follow-up', async () => {
		const item = planItem( 'headers' );
		deployment.prepareEdgeWorkerDeploymentPlan.mockResolvedValue( [ item ] );
		deployment.applyEdgeWorkerDeploymentPlan.mockImplementation(
			async ( _envId, items, onApplied ) => {
				await onApplied( items[ 0 ], {
					id: 42,
					name: 'headers',
					phases: [ 'client_response' ],
					active: false,
				} );
			}
		);

		await edgeWorkersDeployCommand( [ 'headers' ], opts );

		expect( console.log ).toHaveBeenCalledWith(
			'✓ created "headers"; inactive (7 bytes, phases: client_response)'
		);
		expect( console.log ).toHaveBeenCalledWith(
			'Review created inactive edge worker "headers", then run `vip edge-workers enable <name>` when ready.'
		);
		expect(
			console.log.mock.calls.filter( ( [ message ] ) =>
				String( message ).startsWith( 'Review created' )
			)
		).toHaveLength( 1 );
	} );

	it( 'lists each upload-only --all create once in one review follow-up', async () => {
		const plan = [ planItem( 'alpha' ), planItem( 'beta' ) ];
		deployment.prepareEdgeWorkerDeploymentPlan.mockResolvedValue( plan );
		deployment.applyEdgeWorkerDeploymentPlan.mockImplementation(
			async ( _envId, items, onApplied ) => {
				for ( const item of items ) {
					await onApplied( item, {
						id: item.worker.manifest.name === 'alpha' ? 1 : 2,
						name: item.worker.manifest.name,
						phases: [ 'client_response' ],
						active: false,
					} );
				}
			}
		);

		await edgeWorkersDeployCommand( [], { ...opts, all: true } );

		const guidance = console.log.mock.calls
			.map( ( [ message ] ) => String( message ) )
			.find( message => message.startsWith( 'Review created' ) );
		expect( guidance ).toBe(
			'Review created inactive edge workers "alpha", "beta", then run `vip edge-workers enable <name>` for each one when ready.'
		);
		expect( guidance?.match( /alpha/g ) ).toHaveLength( 1 );
		expect( guidance?.match( /beta/g ) ).toHaveLength( 1 );
		expect( tracker.trackEventWithEnv ).toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_deploy_command_success',
			{ count: 2, enable: false, activeCount: 0 }
		);
	} );

	it( 'does not preview or apply when preparation fails', async () => {
		deployment.prepareEdgeWorkerDeploymentPlan.mockRejectedValue(
			new Error( 'worker "beta" failed validation' )
		);

		await expect( edgeWorkersDeployCommand( [], { ...opts, all: true } ) ).rejects.toBe(
			'EXIT_WITH_ERROR'
		);

		expect( deployment.deploymentPlanRows ).not.toHaveBeenCalled();
		expect( format.formatData ).not.toHaveBeenCalled();
		expect( deployment.applyEdgeWorkerDeploymentPlan ).not.toHaveBeenCalled();
		expect( exit.withError ).toHaveBeenCalledWith(
			'Failed to deploy edge worker: worker "beta" failed validation'
		);
		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
		expect( console.log ).not.toHaveBeenCalledWith( expect.stringMatching( /^✓/ ) );
		expect( tracker.trackEventWithEnv ).not.toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_deploy_command_success',
			expect.anything()
		);
	} );

	it( 'keeps preparation diagnostics local and out of analytics', async () => {
		const secret = 'SENTINEL_DEPLOY_SECRET';
		const sourcePath = '/private/customer/project/workers/headers/assembly/index.ts';
		deployment.prepareEdgeWorkerDeploymentPlan.mockRejectedValue(
			new Error( `Compiler printed ${ sourcePath }: ${ secret }\n\u001b[31merror` )
		);

		await expect( edgeWorkersDeployCommand( [ 'headers' ], opts ) ).rejects.toBe(
			'EXIT_WITH_ERROR'
		);

		expect( tracker.trackEventWithEnv ).toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_deploy_command_error',
			{ name: 'headers', error: 'deploy_failed' }
		);
		expect( JSON.stringify( tracker.trackEventWithEnv.mock.calls ) ).not.toContain( secret );
		expect( JSON.stringify( tracker.trackEventWithEnv.mock.calls ) ).not.toContain( sourcePath );
		expect( exit.withError ).toHaveBeenCalledWith( expect.stringContaining( secret ) );
		expect( exit.withError ).toHaveBeenCalledWith( expect.stringContaining( sourcePath ) );
	} );

	it( 'reports exact progress and the original cause after a partial failure', async () => {
		const cause = new Error( 'request timed out' );
		deployment.applyEdgeWorkerDeploymentPlan.mockRejectedValue(
			new deployment.DeploymentApplyError( [ 'alpha' ], 'beta', [ 'gamma' ], cause, {
				stage: 'upload',
				uploadCompleted: false,
				activeAfterUpload: null,
			} )
		);

		await expect( edgeWorkersDeployCommand( [], { ...opts, all: true } ) ).rejects.toBe(
			'EXIT_WITH_ERROR'
		);

		expect( exit.withError ).toHaveBeenCalledWith(
			'Deployment stopped at "beta". Applied: alpha. Not applied: gamma. Cause: request timed out'
		);
		expect( tracker.trackEventWithEnv ).not.toHaveBeenCalledWith(
			1,
			3,
			'edge_workers_deploy_command_success',
			expect.anything()
		);
	} );

	it( 'reports enable-stage upload state as last confirmed and final state as unknown', async () => {
		const cause = new Error( 'request timed out' );
		deployment.applyEdgeWorkerDeploymentPlan.mockRejectedValue(
			new deployment.DeploymentApplyError( [ 'alpha' ], 'beta', [ 'gamma' ], cause, {
				stage: 'enable',
				uploadCompleted: true,
				activeAfterUpload: false,
			} )
		);

		await expect(
			edgeWorkersDeployCommand( [], { ...opts, all: true, enable: true } )
		).rejects.toBe( 'EXIT_WITH_ERROR' );

		expect( exit.withError ).toHaveBeenCalledWith(
			'Deployment uploaded "beta" and its last confirmed state was inactive, but the enable request failed. ' +
				'Final active state is unknown; verify with `vip edge-workers get beta` or `vip edge-workers list`. ' +
				'Completed: alpha. Not attempted: gamma. Cause: request timed out'
		);
		expect( exit.withError ).not.toHaveBeenCalledWith(
			expect.stringContaining( 'remains inactive' )
		);
		expect( console.log ).not.toHaveBeenCalledWith( expect.stringMatching( /^Review created/ ) );
	} );
} );
