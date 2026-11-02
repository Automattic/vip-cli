describe( 'API module loading', () => {
	it( 'loads the client only when an API operation needs it', () => {
		jest.resetModules();
		jest.doMock( '../../src/lib/api/client', () => {
			throw new Error( 'API client loaded' );
		} );

		const apiModule = require( '../../src/lib/api' );
		expect( apiModule.API_URL ).toMatch( /\/graphql$/ );
		expect( apiModule.disableGlobalGraphQLErrorHandling() ).toBeUndefined();
		expect( apiModule.enableGlobalGraphQLErrorHandling() ).toBeUndefined();
		expect( () => apiModule.default() ).toThrow( 'API client loaded' );
	} );
} );
