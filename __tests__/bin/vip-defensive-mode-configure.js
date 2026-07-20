import { describe, expect, it, jest, beforeEach } from '@jest/globals';

import { defensiveModeConfigureCommand } from '../../src/bin/vip-defensive-mode-configure';
import command from '../../src/lib/cli/command';
import { updateDefensiveModeConfig } from '../../src/lib/defensive-mode/api';
import { trackEvent } from '../../src/lib/tracker';

function mockExit() {
	throw 'EXIT';
}
jest.spyOn( console, 'log' ).mockImplementation( () => {} );
jest.spyOn( console, 'error' ).mockImplementation( () => {} );
jest.spyOn( process, 'exit' ).mockImplementation( mockExit );

jest.mock( '../../src/lib/cli/command', () => {
	const commandMock = {
		argv: () => commandMock,
		examples: () => commandMock,
		option: () => commandMock,
	};
	return jest.fn( () => commandMock );
} );

jest.mock( '../../src/lib/defensive-mode/api', () => ( {
	updateDefensiveModeConfig: jest.fn( () =>
		Promise.resolve( { success: true, message: 'configured' } )
	),
	appQuery: 'mock-app-query',
} ) );

jest.mock( '../../src/lib/tracker', () => ( {
	trackEvent: jest.fn( () => Promise.resolve() ),
} ) );

jest.mock( '../../src/lib/envvar/input', () => ( {
	confirm: jest.fn( () => Promise.resolve( true ) ),
} ) );

function baseOpts() {
	return {
		app: { id: 7, name: 'demo', organization: { id: 1, salesforceId: 'X' } },
		env: { id: 9, type: 'develop' },
		skipConfirmation: true,
	};
}

describe( 'vip defensive-mode configure', () => {
	it( 'registers as a command', () => {
		expect( command ).toHaveBeenCalled();
	} );
} );

describe( 'defensiveModeConfigureCommand', () => {
	beforeEach( () => {
		jest.clearAllMocks();
	} );

	it( 'applies full input when all flags are supplied', async () => {
		await defensiveModeConfigureCommand( [], {
			...baseOpts(),
			enabled: 'true',
			challengeType: '1',
			connectionThresholdAbsolute: '1000',
			connectionThresholdPercentage: '50',
		} );
		expect( updateDefensiveModeConfig ).toHaveBeenCalledWith( {
			appId: 7,
			envId: 9,
			enabled: true,
			challengeType: 1,
			connectionThresholdAbsolute: 1000,
			connectionThresholdPercentage: 50,
		} );
	} );

	it( 'errors when required flags missing in non-interactive mode', async () => {
		await expect(
			defensiveModeConfigureCommand( [], {
				...baseOpts(),
				nonInteractive: true,
			} )
		).rejects.toBe( 'EXIT' );
		expect( updateDefensiveModeConfig ).not.toHaveBeenCalled();
	} );

	it( 'rejects non-boolean enabled values', async () => {
		await expect(
			defensiveModeConfigureCommand( [], {
				...baseOpts(),
				enabled: 'maybe',
				challengeType: '1',
				nonInteractive: true,
			} )
		).rejects.toBe( 'EXIT' );
	} );

	it( 'rejects non-integer challenge-type', async () => {
		await expect(
			defensiveModeConfigureCommand( [], {
				...baseOpts(),
				enabled: 'true',
				challengeType: 'oops',
				nonInteractive: true,
			} )
		).rejects.toBe( 'EXIT' );
	} );

	it( 'tracks success', async () => {
		await defensiveModeConfigureCommand( [], {
			...baseOpts(),
			enabled: 'false',
			challengeType: '1',
		} );
		expect( trackEvent ).toHaveBeenCalledWith(
			'defensive_mode_configure_command_success',
			expect.any( Object )
		);
	} );

	it( 'logs the proposed configuration before mutating', async () => {
		const consoleSpy = jest.spyOn( console, 'log' );
		await defensiveModeConfigureCommand( [], {
			...baseOpts(),
			enabled: 'true',
			challengeType: '2',
		} );
		const allArgs = consoleSpy.mock.calls.flat().filter( arg => typeof arg === 'string' );
		const settingsTable = allArgs.find( arg => arg.includes( 'Challenge type' ) );
		expect( settingsTable ).toBeDefined();
		expect( settingsTable ).toContain( 'Enabled' );
		expect( settingsTable ).toContain( 'true' );
		expect( settingsTable ).toContain( '2' );
		expect( settingsTable ).toContain( '(not specified)' );
	} );

	it( 'rejects bare threshold flags (boolean true)', async () => {
		await expect(
			defensiveModeConfigureCommand( [], {
				...baseOpts(),
				enabled: 'true',
				challengeType: '1',
				connectionThresholdAbsolute: true,
				nonInteractive: true,
			} )
		).rejects.toBe( 'EXIT' );
		expect( updateDefensiveModeConfig ).not.toHaveBeenCalled();
	} );

	it( 'refuses production mutation in non-interactive mode without --skip-confirmation', async () => {
		await expect(
			defensiveModeConfigureCommand( [], {
				...baseOpts(),
				env: { id: 9, type: 'production' },
				skipConfirmation: false,
				nonInteractive: true,
				enabled: 'false',
				challengeType: '1',
			} )
		).rejects.toBe( 'EXIT' );
		expect( updateDefensiveModeConfig ).not.toHaveBeenCalled();
	} );

	it( 'allows production mutation in non-interactive mode with --skip-confirmation', async () => {
		await defensiveModeConfigureCommand( [], {
			...baseOpts(),
			env: { id: 9, type: 'production' },
			skipConfirmation: true,
			nonInteractive: true,
			enabled: 'false',
			challengeType: '1',
		} );
		expect( updateDefensiveModeConfig ).toHaveBeenCalledWith(
			expect.objectContaining( { envId: 9, enabled: false, challengeType: 1 } )
		);
	} );
} );
