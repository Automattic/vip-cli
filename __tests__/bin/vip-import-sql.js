/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { validateAndGetTableNames } from 'bin/vip-import-sql';

jest.mock( 'lib/tracker' );
jest.mock( 'lib/validations/site-type' );
jest.mock( 'lib/validations/is-multi-site' );
jest.mock( 'lib/api/feature-flags' );

describe( 'vip-import-sql', () => {
	describe( 'validateAndGetTableNames', () => {
		it( 'returns an empty array when skipValidate is true', async () => {
			const params = {
				skipValidate: true,
				appId: 1,
				envId: 1,
				fileNameToUpload: '__fixtures__/client-file-uploader/db-dump-ipsum-67mb.sql',
			};
			const result = await validateAndGetTableNames( params );
			expect( result ).toEqual( [] );
		} );
		it( 'returns an array of table names that are contained within the input file', async () => {
			const params = {
				skipValidate: false,
				appId: 1,
				envId: 1,
				fileNameToUpload: '__fixtures__/client-file-uploader/db-dump-ipsum-67mb.sql',
			};
			const result = await validateAndGetTableNames( params );
			const expected = [
				'wp_commentmeta',
				'wp_comments',
				'wp_links',
				'wp_options',
				'wp_postmeta',
				'wp_posts',
				'wp_term_relationships',
				'wp_term_taxonomy',
				'wp_termmeta',
				'wp_terms',
				'wp_usermeta',
				'wp_users',
			];
			expect( result ).toEqual( expected );
		} );
	} );
} );
