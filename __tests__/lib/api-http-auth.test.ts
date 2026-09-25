import { getGlobalDispatcher, Headers } from 'undici';

import http from '../../src/lib/api/http';

import type { MockAgent } from 'undici';

describe( 'explicit request credentials', () => {
	const originalToken = process.env.VIP_CLI_TOKEN;
	beforeEach( () => {
		process.env.VIP_CLI_TOKEN = 'not-a-jwt';
	} );
	afterEach( () => {
		if ( originalToken === undefined ) {
			delete process.env.VIP_CLI_TOKEN;
		} else {
			process.env.VIP_CLI_TOKEN = originalToken;
		}
	} );

	it.each( [ '/graphql', '/upload/site-import-presigned-url' ] )(
		'sends deploy credentials to %s despite an invalid ambient PAT',
		async path => {
			const agent = getGlobalDispatcher() as MockAgent;
			agent
				.get( 'http://localhost:4000' )
				.intercept( {
					path,
					method: 'POST',
					headers: { authorization: 'Bearer deploy-fixture' },
				} )
				.reply( 200, { success: true } );
			const response = await http( path, {
				method: 'POST',
				headers: new Headers( { authorization: 'Bearer deploy-fixture' } ),
				body: { input: {} },
			} );
			expect( response.status ).toBe( 200 );
			expect( await response.json() ).toEqual( { success: true } );
		}
	);

	it( 'still rejects an invalid PAT when the request needs the default credentials', async () => {
		await expect( http( '/graphql', { method: 'POST', body: {} } ) ).rejects.toThrow(
			'VIP_CLI_TOKEN'
		);
	} );
} );
