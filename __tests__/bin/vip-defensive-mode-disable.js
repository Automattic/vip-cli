import { describe, expect, it, jest, beforeEach } from '@jest/globals';

import { defensiveModeDisableCommand } from '../../src/bin/vip-defensive-mode-disable';
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
		Promise.resolve( { success: true, message: 'disabled' } )
	),
	appQuery: 'mock-app-query',
} ) );

jest.mock( '../../src/lib/tracker', () => ( {
	trackEvent: jest.fn( () => Promise.resolve() ),
} ) );

describe( 'vip defensive-mode disable', () => {
	it( 'registers as a command', () => {
		expect( command ).toHaveBeenCalled();
	} );
} );

describe( 'defensiveModeDisableCommand', () => {
	beforeEach( () => {
		jest.clearAllMocks();
	} );

	it( 'calls updateDefensiveModeStatus with enabled=false', async () => {
		const opts = {
			app: { id: 7, name: 'demo', organization: { id: 1, salesforceId: 'X' } },
			env: { id: 9, type: 'develop' },
			skipConfirmation: true,
		};
		await defensiveModeDisableCommand( [], opts );
		expect( updateDefensiveModeStatus ).toHaveBeenCalledWith( {
			appId: 7,
			envId: 9,
			enabled: false,
		} );
		expect( trackEvent ).toHaveBeenCalledWith(
			'defensive_mode_disable_command_success',
			expect.any( Object )
		);
	} );
} );
