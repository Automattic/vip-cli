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

	it( 'should strip the Expect header before dispatching through real undici', async () => {
		// If fetchWithRetry does NOT strip the Expect header, undici throws
		// NotSupportedError (UND_ERR_NOT_SUPPORTED) locally before the request
		// reaches the MockAgent — the test fails because fetchWithRetry rejects.
		// The afterEach assertNoPendingInterceptors() check is a secondary guard.
		const pool = getUndiciMockPool( 'https://upload.example.com' );
		pool.intercept( { method: 'POST', path: '/complete' } ).reply( 200, '<ok/>' );

		const response = await fetchWithRetry( 'https://upload.example.com/complete', {
			method: 'POST',
			headers: { Expect: '100-continue', 'Content-Type': 'application/xml' },
			body: '<CompleteMultipartUpload/>',
		} );

		await response.text(); // drain to avoid open handles
		expect( response.status ).toBe( 200 );
	} );

	// Real undici creates promises that fake timers cannot advance reliably on
	// all Node versions. Use real timers; the backoff delay is 1s so the test
	// completes in ~1-2s well within the 8s timeout.
	it( 'should retry a stream body factory through real undici on transient failure', async () => {
		jest.useRealTimers();

		const pool = getUndiciMockPool( 'https://upload.example.com' );
		// First attempt fails; second succeeds. Both go through real undici dispatch.
		pool
			.intercept( { method: 'PUT', path: '/retry' } )
			.replyWithError( new Error( 'socket hang up' ) );
		pool.intercept( { method: 'PUT', path: '/retry' } ).reply( 200, 'ok' );

		const response = await fetchWithRetry(
			'https://upload.example.com/retry',
			{ method: 'PUT' },
			1, // 1 retry, ~1s backoff
			() => Readable.from( [ 'retry-body' ] )
		);

		await response.text(); // drain to avoid open handles
		expect( response.status ).toBe( 200 );
	}, 8000 );
} );
