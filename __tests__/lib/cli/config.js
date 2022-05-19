
/**
 * External dependencies
 */

/**
 * Internal dependencies
 */

describe( 'utils/cli/config', () => {
	beforeEach( () => {
		jest.resetModules();
		jest.clearAllMocks();
	} );
	it.each( [
		{
			description: 'should return development if config.local.json is present',
			files: { local: true, publish: true },
			expected: { environment: 'development' },
			hasError: false,
		},
		{
			description: 'should return production if config.local.json is missing',
			files: { local: false, publish: true },
			expected: { environment: 'production' },
			hasError: false,
		},
		{
			description: 'should throw error if config.local.json and config.publish.json are missing',
			files: { local: false, publish: false },
			expected: { error: 'error' },
			hasError: true,
		},
	] )( '$description', ( { files, expected, hasError } ) => {
		// An array of files would've been nicer but it doesn't play well with jest.doMock
		if ( ! files.local ) {
			jest.doMock( 'root/config/config.local.json', () => {
				throw new Error( );
			} );
		}
		if ( ! files.publish ) {
			jest.doMock( 'root/config/config.publish.json', () => {
				throw new Error( );
			} );
		}
		try {
			const config = require( 'lib/cli/config' );
			expect( config.default ).toMatchObject( expected );
		} catch ( error ) {
			expect( hasError ).toBeTruthy();
		}
	} );
} );
