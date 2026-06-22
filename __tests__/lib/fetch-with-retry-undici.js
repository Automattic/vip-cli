/**
 * @format
 */

import { Readable } from 'node:stream';

import { fetchWithRetry } from '../../src/lib/client-file-uploader';
import { getUndiciMockPool, resetUndiciMockAgent } from '../../test-utils/undici-mock';

describe( 'fetchWithRetry() with real undici', () => {
	afterEach( resetUndiciMockAgent );

	it( 'should add duplex for stream bodies created per attempt', async () => {
		const pool = getUndiciMockPool( 'https://upload.example.com' );
		pool.intercept( { method: 'PUT', path: '/upload' } ).reply( 200, 'ok' );

		const response = await fetchWithRetry(
			'https://upload.example.com/upload',
			{ method: 'PUT' },
			0,
			() => Readable.from( [ 'hello' ] )
		);

		expect( response.status ).toBe( 200 );
		await expect( response.text() ).resolves.toBe( 'ok' );
	} );
} );
