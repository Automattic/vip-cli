import path from 'node:path';

import { edgeWorkersNewCommand } from '../../src/bin/vip-edge-workers-new';
import * as exit from '../../src/lib/cli/exit';
import * as project from '../../src/lib/edge-workers/project';
import * as toolchains from '../../src/lib/edge-workers/toolchains';
import * as tracker from '../../src/lib/tracker';

jest.spyOn( console, 'log' ).mockImplementation( () => {} );
jest.spyOn( exit, 'withError' ).mockImplementation( () => {
	throw 'EXIT_WITH_ERROR';
} );

jest.mock( '../../src/lib/cli/command', () => {
	const commandMock = {
		argv: () => commandMock,
		examples: () => commandMock,
		option: () => commandMock,
	};
	return jest.fn( () => commandMock );
} );

jest.mock( '../../src/lib/edge-workers/project', () => ( {
	readProjectDescriptor: jest.fn(),
	readWorkerManifest: jest.fn(),
	resolveProjectDir: jest.fn(),
	WORKERS_DIR: 'workers',
	writeWorkerManifest: jest.fn(),
} ) );

jest.mock( '../../src/lib/edge-workers/toolchains', () => ( {
	getToolchain: jest.fn(),
} ) );

jest.mock( '../../src/lib/tracker', () => ( {
	trackEvent: jest.fn(),
} ) );

describe( 'edgeWorkersNewCommand()', () => {
	const scaffoldWorker = jest.fn();

	beforeEach( () => {
		jest.clearAllMocks();
		scaffoldWorker.mockReset();
		project.resolveProjectDir.mockReturnValue( '/project' );
		project.readProjectDescriptor.mockReturnValue( { type: 'assemblyscript' } );
		project.readWorkerManifest.mockReturnValue( {
			name: 'demo',
			entry: 'assembly/index.ts',
		} );
		toolchains.getToolchain.mockReturnValue( { scaffoldWorker } );
	} );

	it( 'rejects a non-portable name before resolving or modifying a project', async () => {
		await expect( edgeWorkersNewCommand( [ 'bad/name' ] ) ).rejects.toBe( 'EXIT_WITH_ERROR' );

		expect( project.resolveProjectDir ).not.toHaveBeenCalled();
		expect( scaffoldWorker ).not.toHaveBeenCalled();
		expect( tracker.trackEvent ).toHaveBeenCalledWith( 'edge_workers_new_command_error', {
			name: 'bad/name',
			error: 'Invalid worker name "bad/name".',
		} );
	} );

	it( 'writes and reports an explicit request scope', async () => {
		await edgeWorkersNewCommand( [ 'demo' ], { location: 'starts_with:/api/' } );

		expect( project.writeWorkerManifest ).toHaveBeenCalledWith(
			path.join( '/project', 'workers', 'demo' ),
			{
				name: 'demo',
				entry: 'assembly/index.ts',
				location: { operator: 'starts_with', value: '/api/' },
			}
		);
		expect( console.log ).toHaveBeenCalledWith( 'Scope: starts_with "/api/".' );
	} );

	it( 'rejects an explicitly empty location before resolving or modifying a project', async () => {
		await expect( edgeWorkersNewCommand( [ 'demo' ], { location: '' } ) ).rejects.toBe(
			'EXIT_WITH_ERROR'
		);

		expect( project.resolveProjectDir ).not.toHaveBeenCalled();
		expect( scaffoldWorker ).not.toHaveBeenCalled();
		expect( tracker.trackEvent ).toHaveBeenCalledWith( 'edge_workers_new_command_error', {
			name: 'demo',
			error: expect.stringContaining( 'Invalid location ""' ),
		} );
	} );

	it( 'reports that an omitted location applies to all requests', async () => {
		await edgeWorkersNewCommand( [ 'demo' ] );

		expect( project.writeWorkerManifest ).not.toHaveBeenCalled();
		expect( console.log ).toHaveBeenCalledWith(
			'Scope: all requests. Set location in worker.json before deployment to narrow it.'
		);
	} );

	it( 'reports a toolchain failure without success telemetry or guidance', async () => {
		scaffoldWorker.mockImplementation( () => {
			throw new Error( 'scaffold failed' );
		} );

		await expect( edgeWorkersNewCommand( [ 'demo' ] ) ).rejects.toBe( 'EXIT_WITH_ERROR' );

		expect( tracker.trackEvent ).toHaveBeenCalledWith( 'edge_workers_new_command_error', {
			name: 'demo',
			error: 'scaffold failed',
		} );
		expect( tracker.trackEvent ).not.toHaveBeenCalledWith(
			'edge_workers_new_command_success',
			expect.anything()
		);
		expect( console.log ).not.toHaveBeenCalled();
		expect( exit.withError ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'prints safe success guidance for a non-production environment', async () => {
		await edgeWorkersNewCommand( [ 'demo' ] );

		expect( scaffoldWorker ).toHaveBeenCalledWith( '/project', 'demo' );
		expect( console.log ).toHaveBeenCalledWith( '  vip @my-site.develop edge-workers deploy demo' );
		expect( tracker.trackEvent ).toHaveBeenCalledWith( 'edge_workers_new_command_success', {
			name: 'demo',
			type: 'assemblyscript',
		} );
		const scaffoldOrder = scaffoldWorker.mock.invocationCallOrder[ 0 ];
		const successOrder = tracker.trackEvent.mock.invocationCallOrder.at( -1 );
		expect( scaffoldOrder ).toBeLessThan( successOrder );
	} );
} );
