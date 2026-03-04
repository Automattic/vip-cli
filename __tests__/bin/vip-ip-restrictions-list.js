import { ipRestrictionsListCommand } from '../../src/bin/vip-ip-restrictions-list';
import command from '../../src/lib/cli/command';
import { getIPRestrictions } from '../../src/lib/api/ip-restrictions.ts';
import { trackEvent } from '../../src/lib/tracker';

jest.spyOn( console, 'log' ).mockImplementation( () => {} );

jest.mock( '../../src/lib/cli/command', () => {
	const commandMock = {
		argv: () => commandMock,
		examples: () => commandMock,
	};

	return jest.fn( () => commandMock );
} );

jest.mock( '../../src/lib/api/ip-restrictions.ts', () => ( {
	appQuery: 'mock-app-query',
	getIPRestrictions: jest.fn(),
} ) );

jest.mock( '../../src/lib/tracker', () => ( {
	trackEvent: jest.fn(),
} ) );

describe( 'vip ip-restrictions list', () => {
	it( 'registers as a command', () => {
		expect( command ).toHaveBeenCalled();
	} );
} );

describe( 'ipRestrictionsListCommand', () => {
	const args = [];
	const opts = {
		app: {
			id: 1,
			name: 'test-app',
			organization: {
				id: 2,
			},
		},
		env: {
			id: 3,
			type: 'develop',
		},
		format: 'table',
	};
	const eventPayload = expect.objectContaining( {
		command: 'vip ip-restrictions list',
	} );
	const executeEvent = [ 'ip_restrictions_list_command_execute', eventPayload ];
	const successEvent = [ 'ip_restrictions_list_command_success', eventPayload ];

	beforeEach( () => {
		jest.clearAllMocks();
	} );

	it( 'displays IP restrictions in table format', async () => {
		const mockConfig = {
			data: {
				action: 'deny',
				groups: [
					{
						id: 'group1',
						ips: [ '192.168.1.0/24', '10.0.0.5' ],
						notes: 'Office network',
					},
					{
						id: 'group2',
						ips: [ '1.2.3.4' ],
						notes: 'Malicious IP',
					},
				],
			},
			status: 'success',
		};
		getIPRestrictions.mockResolvedValue( mockConfig );

		await ipRestrictionsListCommand( args, opts );

		expect( getIPRestrictions ).toHaveBeenCalledWith( 1, 3, opts.env );
		expect( console.log ).toHaveBeenCalledWith(
			expect.stringContaining( 'IP Restrictions - DENY mode' )
		);
		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, successEvent ] );
	} );

	it( 'displays IP restrictions in JSON format', async () => {
		const mockConfig = {
			data: {
				action: 'allow',
				groups: [
					{
						id: 'group1',
						ips: [ '192.168.1.1' ],
						notes: 'Test',
					},
				],
			},
			status: 'success',
		};
		getIPRestrictions.mockResolvedValue( mockConfig );

		await ipRestrictionsListCommand( args, { ...opts, format: 'json' } );

		expect( console.log ).toHaveBeenCalledWith(
			JSON.stringify( mockConfig.data, null, 2 )
		);
		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, successEvent ] );
	} );

	it( 'handles empty configuration', async () => {
		const mockConfig = {
			data: {
				action: 'deny',
				groups: [],
			},
			status: 'success',
		};
		getIPRestrictions.mockResolvedValue( mockConfig );

		await ipRestrictionsListCommand( args, opts );

		expect( console.log ).toHaveBeenCalledWith(
			expect.stringContaining( 'No IP restrictions configured' )
		);
		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, successEvent ] );
	} );

	it( 'tracks error event on failure', async () => {
		const error = new Error( 'API error' );
		const errorEvent = [
			'ip_restrictions_list_command_error',
			expect.objectContaining( { error: 'API error' } ),
		];
		getIPRestrictions.mockRejectedValue( error );

		await expect( () => ipRestrictionsListCommand( args, opts ) ).rejects.toThrow(
			'API error'
		);

		expect( trackEvent.mock.calls ).toEqual( [ executeEvent, errorEvent ] );
	} );
} );
