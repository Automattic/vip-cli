import { defensiveModeEnableCommand } from '../../src/bin/vip-defensive-mode-enable';
import * as defensiveModeLib from '../../src/lib/api/defensive-mode';
import * as exit from '../../src/lib/cli/exit';
import * as tracker from '../../src/lib/tracker';

jest.spyOn( console, 'log' ).mockImplementation( () => {} );
jest.spyOn( exit, 'withError' ).mockImplementation( _msg => {
	throw new Error( 'EXIT DEFENSIVE MODE WITH ERROR' );
} );

jest.mock( '../../src/lib/cli/command', () => {
	const commandMock = {
		argv: () => commandMock,
		examples: () => commandMock,
		option: () => commandMock,
	};
	return jest.fn( () => commandMock );
} );

jest.mock( '../../src/lib/api/defensive-mode', () => ( {
	enableDefensiveMode: jest.fn(),
} ) );

jest.mock( '../../src/lib/tracker', () => ( {
	trackEvent: jest.fn(),
} ) );

describe( 'defensiveModeEnableCommand()', () => {
	const opts = {
		app: {
			id: 123,
			name: 'example-app',
		},
		env: {
			id: 456,
			name: 'production',
		},
	};

	beforeEach( jest.clearAllMocks );

	it( 'should enable defensive mode and show success message', async () => {
		defensiveModeLib.enableDefensiveMode.mockResolvedValue( {
			data: {
				statusUpdated: true,
				configUpdated: false,
				effective: {
					enabled: true,
					connectionThresholdPercentage: 90,
				},
			},
			status: 'success',
		} );

		await defensiveModeEnableCommand( [], opts );

		expect( defensiveModeLib.enableDefensiveMode ).toHaveBeenCalledWith( 123, 456 );
		expect( console.log ).toHaveBeenCalled();

		const trackingParams = {
			app_id: 123,
			command: 'vip defensive-mode enable',
			env_id: 456,
		};

		expect( tracker.trackEvent ).toHaveBeenCalledTimes( 2 );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith(
			1,
			'defensive_mode_enable_command_execute',
			trackingParams
		);
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith(
			2,
			'defensive_mode_enable_command_success',
			trackingParams
		);
	} );

	it( 'should output JSON format when --format=json', async () => {
		const result = {
			data: {
				statusUpdated: true,
				configUpdated: false,
				effective: {
					enabled: true,
					connectionThresholdPercentage: 90,
				},
			},
			status: 'success',
		};

		defensiveModeLib.enableDefensiveMode.mockResolvedValue( result );

		await defensiveModeEnableCommand( [], { ...opts, format: 'json' } );

		expect( console.log ).toHaveBeenCalledWith( JSON.stringify( result, null, 2 ) );
	} );

	it( 'should show already enabled message when statusUpdated is false', async () => {
		defensiveModeLib.enableDefensiveMode.mockResolvedValue( {
			data: {
				statusUpdated: false,
				configUpdated: false,
				effective: {
					enabled: true,
					connectionThresholdPercentage: 90,
				},
			},
			status: 'success',
		} );

		await defensiveModeEnableCommand( [], opts );

		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'already enabled' ) );
	} );

	it( 'should handle API errors and track them', async () => {
		const error = new Error( 'Insufficient permissions' );
		defensiveModeLib.enableDefensiveMode.mockRejectedValue( error );

		await expect( defensiveModeEnableCommand( [], opts ) ).rejects.toThrow(
			'EXIT DEFENSIVE MODE WITH ERROR'
		);

		expect( tracker.trackEvent ).toHaveBeenCalledWith( 'defensive_mode_enable_command_error', {
			app_id: 123,
			command: 'vip defensive-mode enable',
			env_id: 456,
			error: 'Insufficient permissions',
		} );

		expect( exit.withError ).toHaveBeenCalledWith(
			'Failed to enable Defensive Mode: Insufficient permissions'
		);
	} );

	it( 'should display threshold for WordPress sites', async () => {
		defensiveModeLib.enableDefensiveMode.mockResolvedValue( {
			data: {
				statusUpdated: true,
				effective: {
					enabled: true,
					connectionThresholdPercentage: 85,
				},
			},
			status: 'success',
		} );

		await defensiveModeEnableCommand( [], opts );

		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( '85% PHP workers' ) );
	} );

	it( 'should display threshold for Node.js sites', async () => {
		defensiveModeLib.enableDefensiveMode.mockResolvedValue( {
			data: {
				statusUpdated: true,
				effective: {
					enabled: true,
					connectionThresholdAbsolute: 100,
				},
			},
			status: 'success',
		} );

		await defensiveModeEnableCommand( [], opts );

		expect( console.log ).toHaveBeenCalledWith(
			expect.stringContaining( '100 concurrent requests' )
		);
	} );
} );
