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
		},
		{
			description: 'should return production if config.local.json is missing',
			files: { local: false, publish: true },
			expected: { environment: 'production' },
		},
		{
			description: 'should throw error if config.local.json and config.publish.json are missing',
			files: { local: false, publish: false },
			expected: Error,
		},
	] )( '$description', ( { files, expected } ) => {
		// An array of files would've been nicer but it doesn't play well with jest.doMock
		if ( ! files.local ) {
			jest.doMock( '../../../config/config.local.json', () => {
				throw new Error();
			} );
		}
		if ( ! files.publish ) {
			jest.doMock( '../../../config/config.publish.json', () => {
				throw new Error();
			} );
		}

		if ( ! files.local && ! files.publish ) {
			// eslint-disable-next-line jest/no-conditional-expect
			expect( () => require( '../../../src/lib/cli/config' ) ).toThrow( expected );
		} else {
			const config = require( '../../../src/lib/cli/config' );
			// eslint-disable-next-line jest/no-conditional-expect
			expect( config.default ).toMatchObject( expected );
		}
	} );
} );
