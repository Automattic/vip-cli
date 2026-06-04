import { describe, expect, it, jest, beforeEach } from '@jest/globals';

import { defensiveModeEnableCommand } from '../../src/bin/vip-defensive-mode-enable';
import command from '../../src/lib/cli/command';
import { updateDefensiveModeStatus } from '../../src/lib/defensive-mode/api';
import { trackEvent } from '../../src/lib/tracker';

function mockExit() {
	throw 'EXIT';
}
jest.spyOn( console, 'log' ).mockImplementation( () => {} );
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
	updateDefensiveModeStatus: jest.fn( () =>
		Promise.resolve( { success: true, message: 'enabled' } )
	),
	appQuery: 'mock-app-query',
} ) );

jest.mock( '../../src/lib/tracker', () => ( {
	trackEvent: jest.fn( () => Promise.resolve() ),
} ) );

const mockUpdate = updateDefensiveModeStatus;
const mockTrack = trackEvent;

describe( 'vip defensive-mode enable', () => {
	it( 'registers as a command', () => {
		expect( command ).toHaveBeenCalled();
	} );
} );

describe( 'defensiveModeEnableCommand', () => {
	beforeEach( () => {
		jest.clearAllMocks();
	} );

	it( 'calls updateDefensiveModeStatus with enabled=true', async () => {
		const opts = {
			app: { id: 7, name: 'demo', organization: { id: 1, salesforceId: 'X' } },
			env: { id: 9, type: 'develop' },
			skipConfirmation: true,
		};
		await defensiveModeEnableCommand( [], opts );
		expect( mockUpdate ).toHaveBeenCalledWith( {
			appId: 7,
			envId: 9,
			enabled: true,
		} );
		expect( mockTrack ).toHaveBeenCalledWith(
			'defensive_mode_enable_command_execute',
			expect.any( Object )
		);
		expect( mockTrack ).toHaveBeenCalledWith(
			'defensive_mode_enable_command_success',
			expect.any( Object )
		);
	} );
} );
