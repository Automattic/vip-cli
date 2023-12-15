/**
 * @format
 */

import { getFileHash, getFileMeta, getPartBoundaries } from '../../src/lib/client-file-uploader';

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
} );
