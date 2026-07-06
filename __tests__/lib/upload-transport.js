/**
 * @format
 *
 * Real-undici integration tests for the upload pipeline.
 *
 * Unlike __tests__/lib/client-file-uploader.js, these tests do NOT mock
 * undici.fetch. The actual file upload PUT goes through real undici dispatch
 * via a scoped real Agent against a local HTTP server. This exercises undici's
 * transport-level contracts (duplex, body consumption, Content-Length
 * enforcement) that a fully-mocked fetch cannot catch.
 *
 * Related: PLTFRM-2494, PLTFRM-2497
 */

import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { createServer } from 'http';
import os from 'os';
import path from 'path';
import { Agent, getGlobalDispatcher, setGlobalDispatcher } from 'undici';

import http from '../../src/lib/api/http';
import { uploadImportFileToS3 } from '../../src/lib/client-file-uploader';
import { resetUndiciMockAgent } from '../../test-utils/undici-mock';

// Mock only the VIP API presigned-URL endpoint; the actual S3 PUT uses real undici.
jest.mock( '../../src/lib/api/http', () => ( {
	__esModule: true,
	default: jest.fn(),
} ) );

describe( 'upload transport (real undici)', () => {
	let tmpDir;

	const writeTempFile = ( name, size ) => {
		const fileName = path.join( tmpDir, name );
		writeFileSync( fileName, Buffer.alloc( size, 0x61 /* 'a' */ ) );
		return fileName;
	};

	// Returns a mock presigned-URL response pointing at the local upload server.
	const presignedResponse = url => ( {
		status: 200,
		json: async () => ( {
			url,
			options: { method: 'PUT', headers: {} },
		} ),
	} );

	beforeAll( () => {
		tmpDir = mkdtempSync( path.join( os.tmpdir(), 'vip-cli-upload-transport-' ) );
	} );

	afterAll( () => {
		rmSync( tmpDir, { recursive: true, force: true } );
	} );

	afterEach( () => {
		http.mockReset();
		resetUndiciMockAgent();
	} );

	it( 'should complete a single-PUT upload through real undici and reach 100% progress', async () => {
		// The upload body is a Transform stream built from createReadStream; real
		// undici enforces that the stream delivers exactly Content-Length bytes.
		// A regression that drains the stream early (e.g. PassThrough data listeners)
		// would cause undici to throw UND_ERR_REQ_CONTENT_LENGTH_MISMATCH here.
		const fileSize = 512;
		const fileName = writeTempFile( 'transport.zip', fileSize );
		const expectedBody = 'a'.repeat( fileSize );
		let uploadServer;

		const uploadRequest = new Promise( ( resolve, reject ) => {
			uploadServer = createServer( async ( request, response ) => {
				try {
					let body = '';
					for await ( const chunk of request ) {
						body += chunk.toString( 'utf8' );
					}

					response.writeHead( 200 );
					response.end( '' );
					resolve( { body, headers: request.headers, method: request.method, url: request.url } );
				} catch ( err ) {
					reject( err );
				}
			} );

			uploadServer.on( 'error', reject );
		} );

		await new Promise( ( resolve, reject ) => {
			const onError = err => {
				reject( err );
			};
			uploadServer.once( 'error', onError );
			uploadServer.listen( 0, '127.0.0.1', () => {
				uploadServer.off( 'error', onError );
				resolve();
			} );
		} );
		const { port } = uploadServer.address();
		const uploadUrl = `http://127.0.0.1:${ port }/put-object`;
		const mockDispatcher = getGlobalDispatcher();
		let realDispatcher;

		const progress = [];
		try {
			realDispatcher = new Agent();
			setGlobalDispatcher( realDispatcher );

			http.mockResolvedValue( presignedResponse( uploadUrl ) );

			const result = await uploadImportFileToS3( {
				app: { id: 1 },
				env: { id: 2 },
				fileMeta: { basename: 'transport.zip', fileName, fileSize, isCompressed: true },
				progressCallback: percentage => progress.push( percentage ),
			} );
			const request = await uploadRequest;

			expect( result.result ).toBe( 'ok' );
			expect( request.method ).toBe( 'PUT' );
			expect( request.url ).toBe( '/put-object' );
			expect( request.headers[ 'content-length' ] ).toBe( `${ fileSize }` );
			expect( request.body ).toBe( expectedBody );
			expect( progress[ progress.length - 1 ] ).toBe( '100%' );
		} finally {
			setGlobalDispatcher( mockDispatcher );
			await realDispatcher?.close();
			await new Promise( resolve => uploadServer.close( resolve ) );
		}
	} );
} );
