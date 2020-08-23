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
				size: 67921765,
			} );
		} );

		it( 'should get meta from a 5+mb text file', async () => {
			const fileName = '__fixtures__/client-file-uploader/numerical-test-file-5.24mb.txt';
			const fileMeta = await getFileMeta( fileName );
			expect( fileMeta ).toMatchObject( {
				basename: 'numerical-test-file-5.24mb.txt',
				fileName,
				md5: '6f18fdff4f9f9926989e0816741aa2ba',
				size: 5242890,
			} );
		} );
	} );

	describe( 'getPartBoundaries()', () => {
		it( 'should handle a small file size', () => {
			const boundaries = getPartBoundaries( 100 );
			expect( boundaries ).toHaveLength( 1 );
			expect( boundaries[ 0 ] ).toMatchObject( { end: 99, index: 0, size: 100, start: 0 } );
		} );

		it( 'should handle a 5mb file size', () => {
			const boundaries = getPartBoundaries( 5242880 );
			expect( boundaries ).toHaveLength( 1 );
			expect( boundaries[ 0 ] ).toMatchObject( {
				end: 5242879,
				index: 0,
				size: 5242880,
				start: 0,
			} );
		} );

		it( 'should handle a 5+mb file size', () => {
			const boundaries = getPartBoundaries( 5242881 );
			expect( boundaries ).toHaveLength( 2 );
			expect( boundaries[ 0 ] ).toMatchObject( {
				end: 5242879,
				index: 0,
				size: 5242880,
				start: 0,
			} );
			expect( boundaries[ 1 ] ).toMatchObject( {
				end: 5242880,
				index: 1,
				size: 1,
				start: 5242880,
			} );
		} );

		it( 'should handle a 67mb sql file', async () => {
			const fileName = '__fixtures__/client-file-uploader/db-dump-ipsum-67mb.sql';
			const fileMeta = await getFileMeta( fileName );
			const parts = getPartBoundaries( fileMeta.size );

			expect( parts ).toEqual( [
				{ end: 5242879, index: 0, size: 5242880, start: 0 },
				{ end: 10485759, index: 1, size: 5242880, start: 5242880 },
				{ end: 15728639, index: 2, size: 5242880, start: 10485760 },
				{ end: 20971519, index: 3, size: 5242880, start: 15728640 },
				{ end: 26214399, index: 4, size: 5242880, start: 20971520 },
				{ end: 31457279, index: 5, size: 5242880, start: 26214400 },
				{ end: 36700159, index: 6, size: 5242880, start: 31457280 },
				{ end: 41943039, index: 7, size: 5242880, start: 36700160 },
				{ end: 47185919, index: 8, size: 5242880, start: 41943040 },
				{ end: 52428799, index: 9, size: 5242880, start: 47185920 },
				{ end: 57671679, index: 10, size: 5242880, start: 52428800 },
				{ end: 62914559, index: 11, size: 5242880, start: 57671680 },
				{ end: 67921764, index: 12, size: 5007205, start: 62914560 },
			] );
		} );
	} );

	describe( 'hashParts()', () => {
		it( 'should annotate a small text file parts with a hash that matches the file hash', async () => {
			const fileName = '__fixtures__/client-file-uploader/tinyfile.txt';
			const expectedHash = '856fefcdf9b935c7bd952847a529e509';
			const fileMeta = await getFileMeta( fileName );
			expect( fileMeta.md5 ).toBe( expectedHash );
			const parts = getPartBoundaries( fileMeta.size );
			const partsWithHash = await hashParts( fileName, parts );

			expect( partsWithHash ).toHaveLength( 1 );
			expect( partsWithHash[ 0 ].md5 ).toBe( expectedHash );
		} );

		it( 'should annotate 5+mb text file parts with hashes', async () => {
			const fileName = '__fixtures__/client-file-uploader/numerical-test-file-5.24mb.txt';
			const fileMeta = await getFileMeta( fileName );
			const parts = getPartBoundaries( fileMeta.size );
			const partsWithHash = await hashParts( fileName, parts );

			expect( partsWithHash ).toHaveLength( 2 );
			expect( partsWithHash[ 0 ].md5 ).toBe( '9ac7a28ed2a4ce9a37b8727bc41d95f9' );
			expect( partsWithHash[ 1 ].md5 ).toBe( 'e0ec043b3f9e198ec09041687e4d4e8d' );
		} );

		it( 'should annotate 67mb sql parts with hashes', async () => {
			const fileName = '__fixtures__/client-file-uploader/db-dump-ipsum-67mb.sql';
			const fileMeta = await getFileMeta( fileName );
			const parts = getPartBoundaries( fileMeta.size );
			const partsWithHash = await hashParts( fileName, parts );

			expect( partsWithHash ).toHaveLength( 13 );
			expect( partsWithHash[ 0 ].md5 ).toBe( 'a857c5cc4608c776808507cec97d2235' );
			expect( partsWithHash[ 1 ].md5 ).toBe( '8df26e5554d6d7c5326a26cfbad85f53' );
			expect( partsWithHash[ 12 ].md5 ).toBe( '15705b12d592056edb6dac23ceee16b9' );
		} );
	} );
} );
