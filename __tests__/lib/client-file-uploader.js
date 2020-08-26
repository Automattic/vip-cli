/**
 * @format
 */

/**
 * External dependencies
 */
/**
 * Internal dependencies
 */
import { getFileMeta, getPartBoundaries, hashParts } from 'lib/client-file-uploader';

describe( 'client-file-uploader', () => {
	describe( 'getFileMeta()', () => {
		it( 'should fail on empty file', async () => {
			const fileName = '__fixtures__/client-file-uploader/emptyfile.txt';
			expect.assertions( 1 );
			await expect( getFileMeta( fileName ) ).rejects.toEqual(
				"File '__fixtures__/client-file-uploader/emptyfile.txt' is empty."
			);
		} );

		it( 'should get meta from a 67mb sql file', async () => {
			const fileName = '__fixtures__/client-file-uploader/db-dump-ipsum-67mb.sql';
			const meta = await getFileMeta( fileName );
			expect( meta ).toMatchObject( {
				basename: 'db-dump-ipsum-67mb.sql',
				fileName,
				md5: '6a051288a7848e3fb3571af220fc455a',
				fileSize: 67921765,
			} );
		} );

		it( 'should get meta from a 5+mb text file', async () => {
			const fileName = '__fixtures__/client-file-uploader/numerical-test-file-5.24mb.txt';
			const fileMeta = await getFileMeta( fileName );
			expect( fileMeta ).toMatchObject( {
				basename: 'numerical-test-file-5.24mb.txt',
				fileName,
				md5: '6f18fdff4f9f9926989e0816741aa2ba',
				fileSize: 5242890,
			} );
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

	describe( 'hashParts()', () => {
		it( 'should annotate a small text file parts with a hash that matches the file hash', async () => {
			const fileName = '__fixtures__/client-file-uploader/tinyfile.txt';
			const expectedHash = '856fefcdf9b935c7bd952847a529e509';
			const fileMeta = await getFileMeta( fileName );
			expect( fileMeta.md5 ).toBe( expectedHash );
			const parts = getPartBoundaries( fileMeta.fileSize );
			const partsWithHash = await hashParts( fileName, parts );

			expect( partsWithHash ).toHaveLength( 1 );
			expect( partsWithHash[ 0 ].md5 ).toBe( expectedHash );
		} );

		it( 'should annotate 67mb sql parts with hashes', async () => {
			const fileName = '__fixtures__/client-file-uploader/db-dump-ipsum-67mb.sql';
			const fileMeta = await getFileMeta( fileName );
			const parts = getPartBoundaries( fileMeta.fileSize );
			const partsWithHash = await hashParts( fileName, parts );

			expect( partsWithHash ).toHaveLength( 5 );
			expect( partsWithHash ).toEqual( [
				{
					end: 16777215,
					index: 0,
					md5: '8c651c16ecc227926b9d2f394f023f33',
					partSize: 16777216,
					start: 0,
				},
				{
					end: 33554431,
					index: 1,
					md5: '7323e6dea6713dc4adfd919dfa412d6c',
					partSize: 16777216,
					start: 16777216,
				},
				{
					end: 50331647,
					index: 2,
					md5: 'b1c81ac598904a6fda06e378671f405f',
					partSize: 16777216,
					start: 33554432,
				},
				{
					end: 67108863,
					index: 3,
					md5: 'c113e49be83d2897be7c178bf5e1fce4',
					partSize: 16777216,
					start: 50331648,
				},
				{
					end: 67921764,
					index: 4,
					md5: '84923a91c5aab4e2434c617644b6627f',
					partSize: 812901,
					start: 67108864,
				},
			] );
		} );
	} );
} );
