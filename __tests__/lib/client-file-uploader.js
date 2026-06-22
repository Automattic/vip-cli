/**
 * @format
 */

import { PassThrough } from 'stream';
import { fetch } from 'undici';

import {
	fetchWithRetry,
	getFileHash,
	getFileMeta,
	getPartBoundaries,
	parseEtagHeader,
} from '../../src/lib/client-file-uploader';

jest.mock( 'undici', () => {
	const actual = jest.requireActual( 'undici' );
	return { ...actual, fetch: jest.fn() };
} );

describe( 'client-file-uploader', () => {
	describe( 'getFileMeta()', () => {
		it( 'should get meta from a 67mb sql file', async () => {
			const fileName = '__fixtures__/client-file-uploader/db-dump-ipsum-67mb.sql';
			const meta = await getFileMeta( fileName );
			expect( meta ).toMatchObject( {
				basename: 'db-dump-ipsum-67mb.sql',
				fileName,
				fileSize: 67921765,
			} );
		} );

		it( 'should get meta from a 5+mb text file', async () => {
			const fileName = '__fixtures__/client-file-uploader/numerical-test-file-5.24mb.txt';
			const fileMeta = await getFileMeta( fileName );
			expect( fileMeta ).toMatchObject( {
				basename: 'numerical-test-file-5.24mb.txt',
				fileName,
				fileSize: 5242890,
			} );
		} );
	} );

	describe( 'getFileHash()', () => {
		it( 'should get hash from a 67mb sql file', async () => {
			const fileName = '__fixtures__/client-file-uploader/db-dump-ipsum-67mb.sql';
			const md5 = await getFileHash( fileName );
			expect( md5 ).toBe( '6a051288a7848e3fb3571af220fc455a' );
		} );

		it( 'should get hash from a 5+mb text file', async () => {
			const fileName = '__fixtures__/client-file-uploader/numerical-test-file-5.24mb.txt';
			const md5 = await getFileHash( fileName );
			expect( md5 ).toBe( '6f18fdff4f9f9926989e0816741aa2ba' );
		} );
	} );

	describe( 'getPartBoundaries()', () => {
		it( 'should handle a small file size', () => {
			const boundaries = getPartBoundaries( 100 );
			expect( boundaries ).toHaveLength( 1 );
			expect( boundaries[ 0 ] ).toMatchObject( { end: 99, index: 0, partSize: 100, start: 0 } );
		} );

		it( 'should handle a 16mb file size', () => {
			const boundaries = getPartBoundaries( 16777216 );
			expect( boundaries ).toHaveLength( 1 );
			expect( boundaries[ 0 ] ).toMatchObject( {
				end: 16777215,
				index: 0,
				partSize: 16777216,
				start: 0,
			} );
		} );

		it( 'should handle a 16+mb file size', () => {
			const boundaries = getPartBoundaries( 16777217 );
			expect( boundaries ).toHaveLength( 2 );
			expect( boundaries[ 0 ] ).toMatchObject( {
				end: 16777215,
				index: 0,
				partSize: 16777216,
				start: 0,
			} );
			expect( boundaries[ 1 ] ).toMatchObject( {
				end: 16777216,
				index: 1,
				partSize: 1,
				start: 16777216,
			} );
		} );

		it( 'should handle a 67mb sql file', async () => {
			const fileName = '__fixtures__/client-file-uploader/db-dump-ipsum-67mb.sql';
			const fileMeta = await getFileMeta( fileName );
			const parts = getPartBoundaries( fileMeta.fileSize );

			expect( parts ).toEqual( [
				{ end: 16777215, index: 0, partSize: 16777216, start: 0 },
				{ end: 33554431, index: 1, partSize: 16777216, start: 16777216 },
				{ end: 50331647, index: 2, partSize: 16777216, start: 33554432 },
				{ end: 67108863, index: 3, partSize: 16777216, start: 50331648 },
				{ end: 67921764, index: 4, partSize: 812901, start: 67108864 },
			] );
		} );
	} );

	describe( 'parseEtagHeader()', () => {
		it( 'should parse a quoted ETag header', () => {
			expect( parseEtagHeader( '"abc123"' ) ).toBe( 'abc123' );
		} );

		it( 'should strip a weak ETag prefix', () => {
			expect( parseEtagHeader( 'W/"abc123"' ) ).toBe( 'abc123' );
		} );

		it( 'should return an unquoted ETag value as-is', () => {
			expect( parseEtagHeader( 'abc123' ) ).toBe( 'abc123' );
		} );
	} );

	describe( 'fetchWithRetry()', () => {
		beforeEach( () => {
			fetch.mockReset();
		} );

		afterEach( () => {
			jest.useRealTimers();
		} );

		it( 'should return the response without retrying on success', async () => {
			const response = { status: 200 };
			fetch.mockResolvedValueOnce( response );

			await expect( fetchWithRetry( 'https://example.com', { method: 'PUT' } ) ).resolves.toBe(
				response
			);
			expect( fetch ).toHaveBeenCalledTimes( 1 );
		} );

		it( 'should recreate the body for each attempt when a factory is provided', async () => {
			jest.useFakeTimers();
			const response = { status: 200 };
			fetch.mockRejectedValueOnce( new Error( 'ECONNRESET' ) ).mockResolvedValueOnce( response );

			let calls = 0;
			const createBody = jest.fn( () => `body-${ ++calls }` );

			const promise = fetchWithRetry( 'https://example.com', { method: 'PUT' }, 3, createBody );
			await jest.advanceTimersByTimeAsync( 1000 );

			await expect( promise ).resolves.toBe( response );
			expect( fetch ).toHaveBeenCalledTimes( 2 );
			expect( createBody ).toHaveBeenCalledTimes( 2 );
			// Each attempt must receive a fresh body, never a reused/consumed one.
			expect( fetch.mock.calls[ 0 ][ 1 ].body ).toBe( 'body-1' );
			expect( fetch.mock.calls[ 1 ][ 1 ].body ).toBe( 'body-2' );
		} );

		it( 'should not retry a one-shot stream body without a factory', async () => {
			const err = new Error( 'socket hang up' );
			fetch.mockRejectedValue( err );

			// A stream body can only be consumed once; retrying it would throw the
			// misleading "Response body object should not be disturbed or locked".
			await expect(
				fetchWithRetry( 'https://example.com', { method: 'PUT', body: new PassThrough() } )
			).rejects.toThrow( 'socket hang up' );
			expect( fetch ).toHaveBeenCalledTimes( 1 );
		} );

		it( 'should retry a non-stream body using the same init', async () => {
			jest.useFakeTimers();
			const response = { status: 200 };
			fetch.mockRejectedValueOnce( new Error( 'flaky' ) ).mockResolvedValueOnce( response );

			const promise = fetchWithRetry( 'https://example.com', {
				method: 'PUT',
				body: 'plain-string',
			} );
			await jest.advanceTimersByTimeAsync( 1000 );

			await expect( promise ).resolves.toBe( response );
			expect( fetch ).toHaveBeenCalledTimes( 2 );
		} );

		it( 'should throw the last error after exhausting retries', async () => {
			jest.useFakeTimers();
			fetch.mockRejectedValue( new Error( 'persistent failure' ) );

			const settled = fetchWithRetry( 'https://example.com', { method: 'GET' }, 2 ).catch(
				err => err
			);
			await jest.advanceTimersByTimeAsync( 1000 + 2000 );

			await expect( settled ).resolves.toThrow( 'persistent failure' );
			expect( fetch ).toHaveBeenCalledTimes( 3 ); // initial attempt + 2 retries
		} );
	} );
} );
