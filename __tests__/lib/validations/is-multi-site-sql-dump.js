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
			expect( sqlDumpLineIsMultiSite( 'CREATE TABLE wp_2_posts' ) ).toBe( true );
			expect( sqlDumpLineIsMultiSite( 'CREATE TABLE wp_23_posts' ) ).toBe( true );
			expect( sqlDumpLineIsMultiSite( 'CREATE TABLE wp_2345235_posts' ) ).toBe( true );
			expect( sqlDumpLineIsMultiSite( 'CREATE TABLE wp_blogs' ) ).toBe( true );
		} );
		it( 'returns false for non-multi site table creations', () => {
			expect( sqlDumpLineIsMultiSite( 'CREATE TABLE wp_posts' ) ).toBe( false );
		} );
		it( 'return true if a wp_users table has a spam or deleted column', () => {
			expect( sqlDumpLineIsMultiSite( '`spam` tinyint(2) NOT NULL DEFAULT 0,' ) ).toBe( true );
			expect( sqlDumpLineIsMultiSite( '`deleted` tinyint(2) NOT NULL DEFAULT 0,' ) ).toBe( true );
		} );
	} );
} );
