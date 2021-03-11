/**
 * @format
 */

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { validationsAndGetTableNames, gates } from 'bin/vip-import-sql';
import * as isMultiSite from 'lib/validations/is-multi-site';
import * as featureFlags from 'lib/api/feature-flags';
import * as exit from 'lib/cli/exit';

jest.mock( 'lib/tracker' );
jest.mock( 'lib/validations/site-type' );
jest.mock( 'lib/validations/is-multi-site' );
jest.mock( 'lib/api/feature-flags' );
const mockExit = jest.spyOn( process, 'exit' ).mockImplementation( () => {} );
const exitWithErrorSpy = jest.spyOn( exit, 'withError' );

describe( 'vip-import-sql', () => {
	describe( 'validationsAndGetTableNames', () => {
		it( 'returns an empty array when skipValidate is true', async () => {
			const params = {
				skipValidate: true,
				appId: 1,
				envId: 1,
				fileNameToUpload: '__fixtures__/client-file-uploader/db-dump-ipsum-67mb.sql',
			};
			const result = await validationsAndGetTableNames( params );
			expect( result ).toEqual( [] );
		} );
		it( 'returns an array of table names that are contained within the input file', async () => {
			const params = {
				skipValidate: false,
				appId: 1,
				envId: 1,
				fileNameToUpload: '__fixtures__/client-file-uploader/db-dump-ipsum-67mb.sql',
			};
			const result = await validationsAndGetTableNames( params );
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
		it( 'exits if featureDisabled (not isVIP) and site is multisite', async () => {
			isMultiSite.isMultiSiteInSiteMeta.mockImplementation( () => true );
			featureFlags.get.mockImplementation( () => {
				const res = {
					data: {
						me: {
							isVIP: false,
						},
					},
				};
				return res;
			} );
			const app = {};
			const env = {
				importStatus: {
					dbOperationInProgress: false,
					importInProgress: false,
				},
			};
			const fileName = '__fixtures__/client-file-uploader/db-dump-ipsum-67mb.sql';
			await gates( app, env, fileName );
			expect( exitWithErrorSpy ).toHaveBeenCalledWith(
				'The feature you are attempting to use is not currently enabled.'
			);
			expect( mockExit ).toHaveBeenCalled();
		} );
	} );
} );
