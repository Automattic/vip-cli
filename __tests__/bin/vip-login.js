import { prompt } from 'enquirer';

import command from '../../src/lib/cli/command';

jest.mock( 'enquirer', () => ( { prompt: jest.fn( async () => ( { continue: false } ) ) } ) );
jest.mock( '../../src/lib/keychain', () => ( {
	getKeychain: async () => ( {
		getPassword: async () => 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6NywiaWF0IjoxNTE2MjM5MDIyfQ.signature',
	} ),
} ) );
jest.mock( '../../src/lib/tracker', () => ( { trackEvent: async () => [] } ) );
jest.mock( '../../src/lib/cli/command', () => {
	const runner = { command: () => runner, argv: jest.fn( async () => {} ) };
	return {
		__esModule: true,
		default: jest.fn( () => runner ),
		containsAppEnvArgument: () => false,
	};
} );

describe( 'root login routing with a valid stored PAT', () => {
	const originalArgv = process.argv;
	const originalToken = process.env.VIP_CLI_TOKEN;

	beforeEach( () => {
		delete process.env.VIP_CLI_TOKEN;
		jest.clearAllMocks();
		jest.spyOn( console, 'log' ).mockImplementation( () => {} );
	} );

	afterEach( () => {
		process.argv = originalArgv;
		if ( originalToken === undefined ) {
			delete process.env.VIP_CLI_TOKEN;
		} else {
			process.env.VIP_CLI_TOKEN = originalToken;
		}
		jest.restoreAllMocks();
	} );

	it( 'starts explicit login even when the stored token is still valid', async () => {
		process.argv = [ process.execPath, 'vip', 'login' ];
		jest.isolateModules( () => require( '../../src/bin/vip' ) );
		await new Promise( resolve => setImmediate( resolve ) );

		expect( prompt ).toHaveBeenCalledWith( expect.objectContaining( { name: 'continue' } ) );
		expect( command ).not.toHaveBeenCalled();
	} );
} );
