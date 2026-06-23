/**
 * @format
 */

import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { PassThrough } from 'stream';
import { fetch } from 'undici';

import http from '../../src/lib/api/http';
import {
	fetchWithRetry,
	getFileHash,
	getFileMeta,
	getPartBoundaries,
	parseEtagHeader,
	uploadImportFileToS3,
	uploadParts,
} from '../../src/lib/client-file-uploader';

jest.mock( 'undici', () => {
	const actual = jest.requireActual( 'undici' );
	return { ...actual, fetch: jest.fn() };
} );

jest.mock( '../../src/lib/api/http', () => ( {
	__esModule: true,
	default: jest.fn(),
} ) );

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

		it( 'should include the underlying fetch cause after exhausting retries', async () => {
			jest.useFakeTimers();
			const cause = new Error( 'write ECONNRESET' );
			const err = new TypeError( 'fetch failed' );
			err.cause = cause;
			fetch.mockRejectedValue( err );

			const settled = fetchWithRetry( 'https://example.com', { method: 'GET' }, 1 ).catch(
				fetchErr => fetchErr
			);
			await jest.advanceTimersByTimeAsync( 1000 );

			await expect( settled ).resolves.toThrow( 'fetch failed: write ECONNRESET' );
			await expect( settled ).resolves.toHaveProperty( 'cause', err );
			expect( fetch ).toHaveBeenCalledTimes( 2 ); // initial attempt + 1 retry
		} );

		it( 'should omit unsupported expect headers before sending fetch requests', async () => {
			const response = { status: 200 };
			fetch.mockResolvedValueOnce( response );

			await expect(
				fetchWithRetry( 'https://example.com', {
					method: 'POST',
					headers: { Expect: '100-continue', 'Content-Type': 'application/xml' },
					body: '<xml />',
				} )
			).resolves.toBe( response );

			expect( fetch ).toHaveBeenCalledTimes( 1 );
			const headers = fetch.mock.calls[ 0 ][ 1 ].headers;
			expect( headers.get( 'expect' ) ).toBeNull();
			expect( headers.get( 'content-type' ) ).toBe( 'application/xml' );
		} );
	} );

	describe( 'uploadImportFileToS3()', () => {
		let tmpDir;

		const presignedResponse = () => ( {
			status: 200,
			json: async () => ( {
				url: 'https://s3.example.com/put-object',
				options: { method: 'PUT', headers: {} },
			} ),
		} );

		const writeTempFile = ( name, size ) => {
			const fileName = path.join( tmpDir, name );
			writeFileSync( fileName, Buffer.alloc( size, 'a' ) );
			return fileName;
		};

		beforeAll( () => {
			tmpDir = mkdtempSync( path.join( os.tmpdir(), 'vip-cli-upload-import-' ) );
		} );

		afterAll( () => {
			rmSync( tmpDir, { recursive: true, force: true } );
		} );

		beforeEach( () => {
			fetch.mockReset();
			http.mockReset();
		} );

		it( 'should stream exactly Content-Length bytes for single-PUT uploads', async () => {
			const fileSize = 256;
			const fileName = writeTempFile( 'single-put.zip', fileSize );
			const progress = [];
			let uploadedBytes = 0;

			http.mockResolvedValue( presignedResponse() );
			fetch.mockImplementation( async ( _url, init ) => {
				expect( init.headers.get( 'content-length' ) ).toBe( `${ fileSize }` );

				for await ( const chunk of init.body ) {
					uploadedBytes += chunk.length;
				}

				return { status: 200 };
			} );

			const result = await uploadImportFileToS3( {
				app: { id: 1 },
				env: { id: 2 },
				fileMeta: { basename: 'single-put.zip', fileName, fileSize, isCompressed: true },
				progressCallback: percentage => progress.push( percentage ),
			} );

			expect( result.result ).toBe( 'ok' );
			expect( uploadedBytes ).toBe( fileSize );
			expect( progress[ progress.length - 1 ] ).toBe( '100%' );
			expect( fetch ).toHaveBeenCalledTimes( 1 );
		} );
	} );

	describe( 'uploadParts()', () => {
		let tmpDir;

		const presignedResponse = () => ( {
			status: 200,
			json: async () => ( {
				url: 'https://s3.example.com/upload-part',
				options: { method: 'PUT', headers: {} },
			} ),
		} );

		const uploadOkResponse = etag => ( {
			status: 200,
			headers: { get: header => ( header === 'etag' ? `"${ etag }"` : null ) },
		} );

		// Real `fetch` consumes the request body; the mock must drain it so the
		// progress PassThrough emits 'data' deterministically and the file stream
		// closes (otherwise it would error after the temp dir is removed).
		const drainBody = body =>
			new Promise( ( resolve, reject ) => {
				if ( ! body || typeof body.resume !== 'function' ) {
					resolve();
					return;
				}
				body.on( 'end', resolve );
				body.on( 'close', resolve );
				body.on( 'error', reject );
				body.resume();
			} );

		const writeTempFile = ( name, size ) => {
			const fileName = path.join( tmpDir, name );
			writeFileSync( fileName, Buffer.alloc( size, 'a' ) );
			return fileName;
		};

		beforeAll( () => {
			tmpDir = mkdtempSync( path.join( os.tmpdir(), 'vip-cli-upload-parts-' ) );
		} );

		afterAll( () => {
			rmSync( tmpDir, { recursive: true, force: true } );
		} );

		beforeEach( () => {
			fetch.mockReset();
			http.mockReset();
		} );

		it( 'should upload every part and aggregate progress without exceeding 100%', async () => {
			const fileSize = 200;
			const fileName = writeTempFile( 'two-parts.bin', fileSize );
			const parts = [
				{ start: 0, end: 99, index: 0, partSize: 100 },
				{ start: 100, end: 199, index: 1, partSize: 100 },
			];

			http.mockResolvedValue( presignedResponse() );
			let etagCounter = 0;
			fetch.mockImplementation( async ( _url, init ) => {
				await drainBody( init.body );
				return uploadOkResponse( `etag-${ etagCounter++ }` );
			} );

			const progress = [];
			const result = await uploadParts( {
				app: { id: 1 },
				env: { id: 2 },
				fileMeta: { basename: 'two-parts.bin', fileName, fileSize, isCompressed: false },
				uploadId: 'upload-id',
				parts,
				progressCallback: percentage => progress.push( percentage ),
			} );

			expect( result ).toHaveLength( 2 );
			expect( result.map( part => part.PartNumber ).sort() ).toEqual( [ 1, 2 ] );
			expect( result.every( part => typeof part.ETag === 'string' ) ).toBe( true );
			expect( fetch ).toHaveBeenCalledTimes( 2 );
			// Every reported percentage must stay within bounds, and the upload must
			// finish at exactly 100% (aggregated across both parts).
			expect( progress.every( pct => parseInt( pct, 10 ) <= 100 ) ).toBe( true );
			expect( progress[ progress.length - 1 ] ).toBe( '100%' );
		} );

		it( 'should retry a failed part without double-counting its progress', async () => {
			const fileSize = 100;
			const fileName = writeTempFile( 'one-part.bin', fileSize );
			const parts = [ { start: 0, end: 99, index: 0, partSize: 100 } ];

			http.mockResolvedValue( presignedResponse() );
			fetch
				.mockImplementationOnce( async ( _url, init ) => {
					// Fail after the body has streamed, mirroring a mid-flight reset.
					await drainBody( init.body );
					throw new Error( 'ECONNRESET' );
				} )
				.mockImplementationOnce( async ( _url, init ) => {
					await drainBody( init.body );
					return uploadOkResponse( 'etag-retry' );
				} );

			const progress = [];
			const result = await uploadParts( {
				app: { id: 1 },
				env: { id: 2 },
				fileMeta: { basename: 'one-part.bin', fileName, fileSize, isCompressed: false },
				uploadId: 'upload-id',
				parts,
				progressCallback: percentage => progress.push( percentage ),
			} );

			expect( result ).toHaveLength( 1 );
			expect( result[ 0 ].ETag ).toBe( 'etag-retry' );
			// Retried via fetchWithRetry: two fetch attempts...
			expect( fetch ).toHaveBeenCalledTimes( 2 );
			// ...but the presigned request is fetched only once per part.
			expect( http ).toHaveBeenCalledTimes( 1 );
			// The first (failed) attempt still streamed the part's bytes; the retry
			// must reset this part's counter so progress never exceeds 100%.
			expect( progress.every( pct => parseInt( pct, 10 ) <= 100 ) ).toBe( true );
			expect( progress[ progress.length - 1 ] ).toBe( '100%' );
		}, 15000 );
	} );
} );
