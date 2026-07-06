import { describe, expect, it, jest, beforeEach } from '@jest/globals';

import * as apiModule from '../../../src/lib/api';
import {
	updateDefensiveModeStatus,
	updateDefensiveModeConfig,
} from '../../../src/lib/defensive-mode/api';

jest.mock( '../../../src/lib/api' );

const mockedAPI = apiModule as unknown as { default: jest.Mock };

beforeEach( () => {
	mockedAPI.default = jest.fn().mockReturnValue( {
		mutate: jest.fn( () =>
			Promise.resolve( {
				data: {
					updateDefensiveModeStatus: { success: true, message: 'ok' },
					updateDefensiveModeConfig: { success: true, message: 'ok' },
				},
			} )
		),
	} );
} );

describe( 'updateDefensiveModeStatus', () => {
	it( 'sends appId, envId, enabled', async () => {
		await updateDefensiveModeStatus( { appId: 1, envId: 2, enabled: true } );
		const client = mockedAPI.default.mock.results[ 0 ].value as {
			mutate: jest.Mock;
		};
		const variables = (
			client.mutate.mock.calls[ 0 ][ 0 ] as {
				variables: Record< string, unknown >;
			}
		 ).variables;
		expect( variables ).toEqual( {
			input: { id: 1, environmentId: 2, enabled: true },
		} );
	} );
} );

describe( 'updateDefensiveModeConfig', () => {
	it( 'sends the full config input', async () => {
		await updateDefensiveModeConfig( {
			appId: 1,
			envId: 2,
			enabled: true,
			challengeType: 1,
			connectionThresholdAbsolute: 1000,
			connectionThresholdPercentage: 50,
		} );
		const client = mockedAPI.default.mock.results[ 0 ].value as {
			mutate: jest.Mock;
		};
		const variables = (
			client.mutate.mock.calls[ 0 ][ 0 ] as {
				variables: Record< string, unknown >;
			}
		 ).variables;
		expect( variables ).toEqual( {
			input: {
				id: 1,
				environmentId: 2,
				enabled: true,
				challengeType: 1,
				connectionThresholdAbsolute: 1000,
				connectionThresholdPercentage: 50,
			},
		} );
	} );

	it( 'omits optional thresholds when not provided', async () => {
		await updateDefensiveModeConfig( {
			appId: 1,
			envId: 2,
			enabled: false,
			challengeType: 1,
		} );
		const client = mockedAPI.default.mock.results[ 0 ].value as {
			mutate: jest.Mock;
		};
		const variables = (
			client.mutate.mock.calls[ 0 ][ 0 ] as {
				variables: { input: Record< string, unknown > };
			}
		 ).variables;
		expect( variables.input ).not.toHaveProperty( 'connectionThresholdAbsolute' );
		expect( variables.input ).not.toHaveProperty( 'connectionThresholdPercentage' );
	} );
} );
