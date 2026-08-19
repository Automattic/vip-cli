import { describe, expect, it } from '@jest/globals';

import { safeGraphQLErrorDebugInfo } from '../../src/lib/api/error-debug';

describe( 'safeGraphQLErrorDebugInfo()', () => {
	it( 'returns only allowlisted operation, path, and string code metadata', () => {
		const error = {
			message: 'field failed',
			path: [ 'app', 'environments', 0, 'envVars' ],
			extensions: { code: 'FORBIDDEN', secret: 'must-not-appear' },
		};

		const info = safeGraphQLErrorDebugInfo( 'EnvVars', [ error ] );

		expect( info ).toEqual( [
			{
				operation: 'EnvVars',
				path: [ 'app', 'environments', 0, 'envVars' ],
				code: 'FORBIDDEN',
			},
		] );
		expect( JSON.stringify( info ) ).not.toContain( 'field failed' );
		expect( JSON.stringify( info ) ).not.toContain( 'must-not-appear' );
	} );

	it( 'omits non-string codes and defaults a missing path to an empty array', () => {
		const error = {
			message: 'binary rejected',
			extensions: { code: 403, source: 'sensitive source' },
		};
		const info = safeGraphQLErrorDebugInfo( 'EdgeWorkerDetail', [ error ] );

		expect( info ).toEqual( [ { operation: 'EdgeWorkerDetail', path: [] } ] );
		expect( JSON.stringify( info ) ).not.toContain( 'binary rejected' );
		expect( JSON.stringify( info ) ).not.toContain( 'sensitive source' );
	} );
} );
