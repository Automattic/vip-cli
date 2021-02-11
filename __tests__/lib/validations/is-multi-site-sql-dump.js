/**
 * @format
 */

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { sqlDumpLineIsMultiSite } from 'lib/validations/is-multi-site-sql-dump';

describe( 'is-multi-site-sql-dump', () => {
	describe( 'sqlDumpLineIsMultiSite', () => {
		it( 'return true when a multisite table line is detected', () => {
			expect( sqlDumpLineIsMultiSite( 'CREATE TABLE wp_2_posts' ) ).toBeTruthy();
			expect( sqlDumpLineIsMultiSite( 'CREATE TABLE wp_23_posts' ) ).toBeTruthy();
			expect( sqlDumpLineIsMultiSite( 'CREATE TABLE wp_2345235_posts' ) ).toBeTruthy();
		} );
	} );
} );
