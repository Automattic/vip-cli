/**
 * External dependencies
 */
import path from 'path';

/**
 * Internal dependencies
 */
import { validateAndGetTableNames, gates } from '../../src/bin/vip-import-sql';
import * as exit from '../../src/lib/cli/exit';

jest.mock( '../../src/lib/tracker' );
jest.mock( '../../src/lib/validations/site-type' );
jest.mock( '../../src/lib/validations/is-multi-site' );
jest.mock( '../../src/lib/api/feature-flags' );
jest.spyOn( process, 'exit' ).mockImplementation( () => {} );
jest.spyOn( console, 'log' ).mockImplementation( () => {} );

const mockExit = jest.spyOn( exit, 'withError' );

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

	describe( 'gates', () => {
		const opts = {
			app: {
				id: 1,
				type: 'WordPress',
				organization: {
					id: 2,
				},
			},
			env: {
				id: 1,
				type: 'develop',
				importStatus: {
					dbOperationInProgress: false,
					importInProgress: false,
				},
			},
		};

		beforeEach( async () => {
			mockExit.mockClear();
		} );

		it( 'fails if the import file has an invalid extension', async () => {
			const compressedFilePath = path.join(
				process.cwd(),
				'__fixtures__',
				'validations',
				'empty.zip'
			);

			await gates( opts.app, opts.env, compressedFilePath );
			expect( mockExit ).toHaveBeenCalledWith( 'File must have an extension of .gz or .sql.' );
		} );

		it.each( [ 'empty.sql.gz', 'bad-sql-dump.sql' ] )(
			'passes if the import file has a valid extension',
			async fileName => {
				const validPath = path.join( process.cwd(), '__fixtures__', 'validations', fileName );

				await gates( opts.app, opts.env, validPath );
				expect( mockExit ).not.toHaveBeenCalled();
			}
		);
	} );
} );
