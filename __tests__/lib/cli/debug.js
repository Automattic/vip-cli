import { afterEach, describe, expect, it, jest } from '@jest/globals';
import debugLib from 'debug';

import command from '../../../src/lib/cli/command';

jest.mock( '../../../src/lib/tracker', () => ( { trackEvent: jest.fn() } ) );

describe( 'command debug output', () => {
	const originalNamespaces = debugLib.disable();

	afterEach( () => {
		debugLib.enable( originalNamespaces );
		jest.restoreAllMocks();
	} );

	it.each( [
		[ [], false ],
		[ [ '-d' ], true ],
		[ [ '--debug' ], true ],
		[ [ '-d=@automattic/vip:http' ], true ],
		[ [ '--debug', '@automattic/vip:http' ], true ],
		[ [ '--debug=unrelated' ], false ],
		[ [ '--debug=*,-@automattic/vip:http' ], false ],
	] )( 'emits namespace-filtered diagnostics for %j', async ( flags, enabled ) => {
		debugLib.disable();
		const diagnosticOutput = jest.spyOn( debugLib, 'log' ).mockImplementation( () => {} );
		const stdout = jest.spyOn( console, 'log' ).mockImplementation( () => {} );
		const debug = debugLib( '@automattic/vip:http' );
		await command( {} ).argv( [ process.execPath, 'vip-probe.js', ...flags ], () => {
			debug( 'running fetch https://example.test/graphql' );
		} );
		expect( diagnosticOutput ).toHaveBeenCalledTimes( enabled ? 1 : 0 );
		const messages = diagnosticOutput.mock.calls.map( call => call[ 0 ] ).join( '\n' );
		expect( messages.includes( 'running fetch' ) ).toBe( enabled );
		expect( stdout ).not.toHaveBeenCalled();
	} );
} );
