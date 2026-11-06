import gql from 'graphql-tag';
import { getGlobalDispatcher } from 'undici';

import API from '../../src/lib/api';
import Token from '../../src/lib/token';

import type { MockAgent } from 'undici';

const query = gql`
	query AuthError {
		me {
			id
		}
	}
`;

function rejectRequest( body: string ): void {
	const agent = getGlobalDispatcher() as MockAgent;
	agent
		.get( 'http://localhost:4000' )
		.intercept( { path: '/graphql', method: 'POST' } )
		.reply( 401, body );
}

describe( '401 recovery guidance', () => {
	const originalToken = process.env.VIP_CLI_TOKEN;
	let messages: string[];
	let exitCode: string | number | null | undefined;

	beforeEach( () => {
		messages = [];
		exitCode = undefined;
		jest
			.spyOn( Token, 'get' )
			.mockResolvedValue(
				new Token( 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6NywiaWF0IjoxNTE2MjM5MDIyfQ.signature' )
			);
		jest.spyOn( console, 'error' ).mockImplementation( ( ...args: unknown[] ) => {
			messages.push( args.map( String ).join( ' ' ) );
		} );
		jest.spyOn( process, 'exit' ).mockImplementation( code => {
			exitCode = code;
			return undefined as never;
		} );
	} );

	afterEach( () => {
		if ( originalToken === undefined ) {
			delete process.env.VIP_CLI_TOKEN;
		} else {
			process.env.VIP_CLI_TOKEN = originalToken;
		}
		jest.restoreAllMocks();
	} );

	describe.each( [
		{
			name: 'environment',
			token: 'environment-pat-sentinel',
			expected:
				'replace the token in VIP_CLI_TOKEN, or unset VIP_CLI_TOKEN to use stored credentials',
			unexpected: 'vip logout',
		},
		{
			name: 'stored',
			token: '',
			expected: 'please log out with `vip logout`',
			unexpected: 'VIP_CLI_TOKEN',
		},
		{
			name: 'blank environment',
			token: '   ',
			expected: 'please log out with `vip logout`',
			unexpected: 'VIP_CLI_TOKEN',
		},
	] )( '$name credentials', ( { token, expected, unexpected } ) => {
		it.each( [
			[ '{}', 'You are not authorized to perform this request' ],
			[ 'not-json', 'You are not authorized to perform this request' ],
			[ '{"code":"token-disabled-inactivity"}', 'Your token has expired due to inactivity' ],
		] )( 'handles a 401 body of %s', async ( body, reason ) => {
			process.env.VIP_CLI_TOKEN = token;
			rejectRequest( body );
			const client = API();
			await expect( client.query( { query } ) ).rejects.toThrow();
			client.stop();
			expect( exitCode ).toBe( 1 );
			expect( messages ).toHaveLength( 1 );
			expect( messages[ 0 ] ).toContain( reason );
			expect( messages[ 0 ] ).toContain( expected );
			expect( messages[ 0 ] ).not.toContain( unexpected );
			expect( messages[ 0 ] ).not.toContain( 'environment-pat-sentinel' );
		} );
	} );

	it( 'does not blame the environment PAT when a request overrides Authorization', async () => {
		process.env.VIP_CLI_TOKEN = 'environment-pat-sentinel';
		rejectRequest( '{}' );
		const client = API();
		await expect(
			client.query( {
				query,
				context: { headers: { authorization: 'Bearer deploy-token-sentinel' } },
			} )
		).rejects.toThrow();
		client.stop();
		expect( exitCode ).toBe( 1 );
		expect( messages ).toHaveLength( 1 );
		expect( messages[ 0 ] ).not.toContain( 'VIP_CLI_TOKEN' );
		expect( messages[ 0 ] ).not.toContain( 'deploy-token-sentinel' );
	} );

	it( 'still silences auth errors with an environment token', async () => {
		process.env.VIP_CLI_TOKEN = 'environment-pat-sentinel';
		rejectRequest( '{}' );
		const client = API( { silenceAuthErrors: true } );
		await expect( client.query( { query } ) ).rejects.toThrow();
		client.stop();
		expect( exitCode ).toBeUndefined();
		expect( messages ).toEqual( [] );
	} );
} );
