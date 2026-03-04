import { defensiveModeStatusCommand } from '../../src/bin/vip-defensive-mode-status';
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
	getDefensiveMode: jest.fn(),
} ) );

jest.mock( '../../src/lib/tracker', () => ( {
	trackEvent: jest.fn(),
} ) );

describe( 'defensiveModeStatusCommand()', () => {
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

	it( 'should display status when defensive mode is active', async () => {
		defensiveModeLib.getDefensiveMode.mockResolvedValue( {
			data: {
				stored: {
					enabled: true,
					connectionThresholdPercentage: 85,
				},
				effective: {
					enabled: true,
					connectionThresholdPercentage: 85,
					challengeType: 1,
					maxRequestRate: 10,
					keepEnabledUnderThresholdForSeconds: 300,
					priorityBypass: 3,
				},
			},
			status: 'success',
		} );

		await defensiveModeStatusCommand( [], opts );

		expect( defensiveModeLib.getDefensiveMode ).toHaveBeenCalledWith( 123, 456, opts.env );
		expect( console.log ).toHaveBeenCalledWith(
			expect.stringContaining( 'Defensive Mode Status' )
		);
		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'ACTIVE' ) );

		const trackingParams = {
			app_id: 123,
			command: 'vip defensive-mode status',
			env_id: 456,
		};

		expect( tracker.trackEvent ).toHaveBeenCalledTimes( 2 );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith(
			1,
			'defensive_mode_status_command_execute',
			trackingParams
		);
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith(
			2,
			'defensive_mode_status_command_success',
			trackingParams
		);
	} );

	it( 'should display status when defensive mode is inactive', async () => {
		defensiveModeLib.getDefensiveMode.mockResolvedValue( {
			data: {
				stored: null,
				effective: {
					enabled: false,
				},
			},
			status: 'success',
		} );

		await defensiveModeStatusCommand( [], opts );

		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'INACTIVE' ) );
	} );

	it( 'should output JSON format when --format=json', async () => {
		const result = {
			data: {
				stored: null,
				effective: {
					enabled: true,
					connectionThresholdPercentage: 90,
				},
			},
			status: 'success',
		};

		defensiveModeLib.getDefensiveMode.mockResolvedValue( result );

		await defensiveModeStatusCommand( [], { ...opts, format: 'json' } );

		expect( console.log ).toHaveBeenCalledWith( JSON.stringify( result, null, 2 ) );
	} );

	it( 'should display WordPress site threshold', async () => {
		defensiveModeLib.getDefensiveMode.mockResolvedValue( {
			data: {
				stored: {
					connectionThresholdPercentage: 85,
				},
				effective: {
					enabled: true,
					connectionThresholdPercentage: 85,
					challengeType: 1,
				},
			},
			status: 'success',
		} );

		await defensiveModeStatusCommand( [], opts );

		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( '85% PHP workers' ) );
		// Threshold should not show (default) since it's custom
		const calls = console.log.mock.calls.flat().join( '\n' );
		expect( calls ).toMatch( /85% PHP workers(?!\s+\(default\))/ );
	} );

	it( 'should display Node.js site threshold', async () => {
		defensiveModeLib.getDefensiveMode.mockResolvedValue( {
			data: {
				stored: null,
				effective: {
					enabled: true,
					connectionThresholdAbsolute: 100,
					challengeType: 1,
				},
			},
			status: 'success',
		} );

		await defensiveModeStatusCommand( [], opts );

		expect( console.log ).toHaveBeenCalledWith(
			expect.stringContaining( '100 concurrent requests' )
		);
		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( '(default)' ) );
	} );

	it( 'should display challenge type correctly', async () => {
		defensiveModeLib.getDefensiveMode.mockResolvedValue( {
			data: {
				stored: {
					challengeType: 2,
				},
				effective: {
					enabled: true,
					connectionThresholdPercentage: 90,
					challengeType: 2,
				},
			},
			status: 'success',
		} );

		await defensiveModeStatusCommand( [], opts );

		expect( console.log ).toHaveBeenCalledWith(
			expect.stringContaining( 'Interactive Challenge' )
		);
	} );

	it( 'should display max request rate as unlimited when 0', async () => {
		defensiveModeLib.getDefensiveMode.mockResolvedValue( {
			data: {
				stored: null,
				effective: {
					enabled: true,
					connectionThresholdPercentage: 90,
					challengeType: 1,
					maxRequestRate: 0,
				},
			},
			status: 'success',
		} );

		await defensiveModeStatusCommand( [], opts );

		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'Unlimited' ) );
	} );

	it( 'should display max request rate with value', async () => {
		defensiveModeLib.getDefensiveMode.mockResolvedValue( {
			data: {
				stored: {
					maxRequestRate: 15,
				},
				effective: {
					enabled: true,
					connectionThresholdPercentage: 90,
					challengeType: 1,
					maxRequestRate: 15,
				},
			},
			status: 'success',
		} );

		await defensiveModeStatusCommand( [], opts );

		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( '15 req/s' ) );
	} );

	it( 'should handle API errors and track them', async () => {
		const error = new Error( 'Network timeout' );
		defensiveModeLib.getDefensiveMode.mockRejectedValue( error );

		await expect( defensiveModeStatusCommand( [], opts ) ).rejects.toThrow(
			'EXIT DEFENSIVE MODE WITH ERROR'
		);

		expect( tracker.trackEvent ).toHaveBeenCalledWith( 'defensive_mode_status_command_error', {
			app_id: 123,
			command: 'vip defensive-mode status',
			env_id: 456,
			error: 'Network timeout',
		} );

		expect( exit.withError ).toHaveBeenCalledWith(
			'Failed to get Defensive Mode status: Network timeout'
		);
	} );

	it( 'should indicate custom vs default values', async () => {
		defensiveModeLib.getDefensiveMode.mockResolvedValue( {
			data: {
				stored: {
					connectionThresholdPercentage: 85,
				},
				effective: {
					enabled: true,
					connectionThresholdPercentage: 85,
					challengeType: 1,
					maxRequestRate: 10,
					keepEnabledUnderThresholdForSeconds: 300,
					priorityBypass: 3,
				},
			},
			status: 'success',
		} );

		await defensiveModeStatusCommand( [], opts );

		// Custom threshold should not show (default)
		const calls = console.log.mock.calls.flat().join( '\n' );
		expect( calls ).toMatch( /85% PHP workers(?!\s+\(default\))/ );
		// Default values should show (default)
		expect( calls ).toContain( 'Proof of Work (default)' );
	} );
} );
