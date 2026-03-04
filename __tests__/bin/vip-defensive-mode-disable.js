import { defensiveModeDisableCommand } from '../../src/bin/vip-defensive-mode-disable';
import * as defensiveModeLib from '../../src/lib/api/defensive-mode';
import * as exit from '../../src/lib/cli/exit';
import * as prompt from '../../src/lib/cli/prompt';
import * as tracker from '../../src/lib/tracker';

jest.spyOn( console, 'log' ).mockImplementation( () => {} );
jest.spyOn( exit, 'withError' ).mockImplementation( _msg => {
	throw new Error( 'EXIT DEFENSIVE MODE WITH ERROR' );
} );
jest.spyOn( process, 'exit' ).mockImplementation( _code => {
	throw new Error( 'EXIT PROCESS' );
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
	disableDefensiveMode: jest.fn(),
} ) );

jest.mock( '../../src/lib/tracker', () => ( {
	trackEvent: jest.fn(),
} ) );

jest.mock( '../../src/lib/cli/prompt', () => ( {
	confirm: jest.fn(),
} ) );

describe( 'defensiveModeDisableCommand()', () => {
	const opts = {
		app: {
			id: 123,
			name: 'example-app',
		},
		env: {
			id: 456,
			name: 'production',
			primaryDomain: {
				name: 'example.com',
			},
		},
	};

	beforeEach( jest.clearAllMocks );

	it( 'should prompt for confirmation before disabling', async () => {
		prompt.confirm.mockResolvedValue( true );
		defensiveModeLib.disableDefensiveMode.mockResolvedValue( {
			data: {
				statusUpdated: true,
				effective: { enabled: false },
			},
			status: 'success',
		} );

		await defensiveModeDisableCommand( [], opts );

		expect( prompt.confirm ).toHaveBeenCalledWith( "Type 'DISABLE' to confirm:", 'DISABLE' );
		expect( defensiveModeLib.disableDefensiveMode ).toHaveBeenCalledWith( 123, 456 );
	} );

	it( 'should skip confirmation when --confirm flag is provided', async () => {
		defensiveModeLib.disableDefensiveMode.mockResolvedValue( {
			data: {
				statusUpdated: true,
				effective: { enabled: false },
			},
			status: 'success',
		} );

		await defensiveModeDisableCommand( [], { ...opts, confirm: true } );

		expect( prompt.confirm ).not.toHaveBeenCalled();
		expect( defensiveModeLib.disableDefensiveMode ).toHaveBeenCalledWith( 123, 456 );
	} );

	it( 'should cancel operation when user declines confirmation', async () => {
		prompt.confirm.mockResolvedValue( false );

		await expect( defensiveModeDisableCommand( [], opts ) ).rejects.toThrow( 'EXIT PROCESS' );

		expect( defensiveModeLib.disableDefensiveMode ).not.toHaveBeenCalled();
		expect( process.exit ).toHaveBeenCalledWith( 0 );
	} );

	it( 'should disable defensive mode and show success message', async () => {
		defensiveModeLib.disableDefensiveMode.mockResolvedValue( {
			data: {
				statusUpdated: true,
				effective: { enabled: false },
			},
			status: 'success',
		} );

		await defensiveModeDisableCommand( [], { ...opts, confirm: true } );

		expect( defensiveModeLib.disableDefensiveMode ).toHaveBeenCalledWith( 123, 456 );
		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'disabled' ) );

		const trackingParams = {
			app_id: 123,
			command: 'vip defensive-mode disable',
			env_id: 456,
		};

		expect( tracker.trackEvent ).toHaveBeenCalledTimes( 2 );
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith(
			1,
			'defensive_mode_disable_command_execute',
			trackingParams
		);
		expect( tracker.trackEvent ).toHaveBeenNthCalledWith(
			2,
			'defensive_mode_disable_command_success',
			trackingParams
		);
	} );

	it( 'should output JSON format when --format=json', async () => {
		const result = {
			data: {
				statusUpdated: true,
				effective: { enabled: false },
			},
			status: 'success',
		};

		defensiveModeLib.disableDefensiveMode.mockResolvedValue( result );

		await defensiveModeDisableCommand( [], { ...opts, confirm: true, format: 'json' } );

		expect( console.log ).toHaveBeenCalledWith( JSON.stringify( result, null, 2 ) );
	} );

	it( 'should show already disabled message when statusUpdated is false', async () => {
		defensiveModeLib.disableDefensiveMode.mockResolvedValue( {
			data: {
				statusUpdated: false,
				effective: { enabled: false },
			},
			status: 'success',
		} );

		await defensiveModeDisableCommand( [], { ...opts, confirm: true } );

		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'already disabled' ) );
	} );

	it( 'should handle API errors and track them', async () => {
		const error = new Error( 'Insufficient permissions' );
		defensiveModeLib.disableDefensiveMode.mockRejectedValue( error );

		await expect( defensiveModeDisableCommand( [], { ...opts, confirm: true } ) ).rejects.toThrow(
			'EXIT DEFENSIVE MODE WITH ERROR'
		);

		expect( tracker.trackEvent ).toHaveBeenCalledWith( 'defensive_mode_disable_command_error', {
			app_id: 123,
			command: 'vip defensive-mode disable',
			env_id: 456,
			error: 'Insufficient permissions',
		} );

		expect( exit.withError ).toHaveBeenCalledWith(
			'Failed to disable Defensive Mode: Insufficient permissions'
		);
	} );

	it( 'should display warning with domain information', async () => {
		prompt.confirm.mockResolvedValue( true );
		defensiveModeLib.disableDefensiveMode.mockResolvedValue( {
			data: {
				statusUpdated: true,
				effective: { enabled: false },
			},
			status: 'success',
		} );

		await defensiveModeDisableCommand( [], opts );

		expect( console.log ).toHaveBeenCalledWith( expect.stringContaining( 'https://example.com' ) );
	} );
} );
