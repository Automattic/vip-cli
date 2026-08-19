import { edgeWorkersInitCommand } from '../../src/bin/vip-edge-workers-init';
import * as exit from '../../src/lib/cli/exit';
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

jest.mock( '../../src/lib/edge-workers/toolchains', () => ( {
	getToolchain: jest.fn(),
} ) );

jest.mock( '../../src/lib/tracker', () => ( {
	trackEvent: jest.fn(),
} ) );

describe( 'edgeWorkersInitCommand()', () => {
	const scaffoldProject = jest.fn();

	beforeEach( () => {
		jest.clearAllMocks();
		toolchains.getToolchain.mockReturnValue( { scaffoldProject } );
	} );

	it( 'scaffolds the requested project and prints next steps', async () => {
		await edgeWorkersInitCommand( [ './infra/edge' ], { type: 'assemblyscript' } );

		expect( scaffoldProject ).toHaveBeenCalledWith( expect.stringMatching( /infra\/edge$/ ) );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 1, 'edge_workers_init_command_execute', {
			type: 'assemblyscript',
		} );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith( 2, 'edge_workers_init_command_success', {
			type: 'assemblyscript',
		} );
		expect( console.log ).toHaveBeenCalledWith(
			expect.stringContaining( 'Created a new assemblyscript edge-workers project' )
		);
		const scaffoldOrder = scaffoldProject.mock.invocationCallOrder[ 0 ];
		const successOrder = tracker.trackEvent.mock.invocationCallOrder.at( -1 );
		expect( scaffoldOrder ).toBeLessThan( successOrder );
	} );

	it( 'reports an unsupported type without scaffolding or success telemetry', async () => {
		await expect( edgeWorkersInitCommand( [], { type: 'rust' } ) ).rejects.toBe(
			'EXIT_WITH_ERROR'
		);

		expect( scaffoldProject ).not.toHaveBeenCalled();
		expect( tracker.trackEvent ).toHaveBeenCalledWith( 'edge_workers_init_command_error', {
			type: 'rust',
			error: 'Unsupported type',
		} );
		expect( tracker.trackEvent ).not.toHaveBeenCalledWith(
			'edge_workers_init_command_success',
			expect.anything()
		);
		expect( console.log ).not.toHaveBeenCalled();
	} );

	it( 'reports a scaffold collision without success telemetry or output', async () => {
		scaffoldProject.mockImplementation( () => {
			throw new Error( 'target is not empty' );
		} );

		await expect( edgeWorkersInitCommand( [], { type: 'assemblyscript' } ) ).rejects.toBe(
			'EXIT_WITH_ERROR'
		);

		expect( tracker.trackEvent ).toHaveBeenCalledWith( 'edge_workers_init_command_error', {
			type: 'assemblyscript',
			error: 'target is not empty',
		} );
		expect( tracker.trackEvent ).not.toHaveBeenCalledWith(
			'edge_workers_init_command_success',
			expect.anything()
		);
		expect( console.log ).not.toHaveBeenCalled();
	} );
} );
