/**
 * @format
 */

/**
 * External dependencies
 */
import nock from 'nock';
import url from 'url';

/**
 * Internal dependencies
 */
import {
	getPrimaryDomainFromSQL,
	maybeSearchReplacePrimaryDomain,
	getPrimaryDomain,
	isMultisitePrimaryDomainMapped,
} from 'lib/validations/is-multisite-domain-mapped';

import { API_URL } from 'lib/api';

describe( 'is-multisite-domain-mapped', () => {
	const capturedStatement = [
		[
			'INSERT INTO `wp_site` (`id`, `domain`, `path`)',
			'VALUES',
			"\t(1,'www.example.com','/');",
		],
	];

	const statementNotFound = [];

	describe( 'getPrimaryDomainFromSQL', () => {
		it( 'should extract the domain from a wp_site INSERT statement', () => {
			const domain = getPrimaryDomainFromSQL( capturedStatement );
			expect( domain ).toEqual( 'www.example.com' );
		} );

		it( 'should return an empty string if no wp_site INSERT statement is found', () => {
			const domain = getPrimaryDomainFromSQL( statementNotFound );
			expect( domain ).toEqual( '' );
		} );
	} );

	describe( 'maybeSearchReplacePrimaryDomain', () => {
		it( 'should replace the domain if there are matching replacements', () => {
			const domain = getPrimaryDomainFromSQL( capturedStatement );
			const replacedDomain = maybeSearchReplacePrimaryDomain( domain, 'www.example.com,www.newdomain.com' );
			expect( replacedDomain ).toEqual( 'www.newdomain.com' );
		} );

		it( 'should handle multiple replacements', () => {
			const domain = getPrimaryDomainFromSQL( capturedStatement );
			const replacedDomain = maybeSearchReplacePrimaryDomain( domain, [ 'example.com,newdomain.com', 'www.example.com,www.newdomain.com' ] );
			expect( replacedDomain ).toEqual( 'www.newdomain.com' );
		} );

		it( 'should return return the original domain if no matching replacements', () => {
			const domain = getPrimaryDomainFromSQL( capturedStatement );
			const replacedDomain = maybeSearchReplacePrimaryDomain( domain, 'example.com,www.newdomain.com' );
			expect( replacedDomain ).toEqual( domain );
		} );
	} );

	describe( 'getPrimaryDomain', () => {
		it( 'should return the domain from a wp_site INSERT statement', () => {
			const domain = getPrimaryDomain( capturedStatement );
			expect( domain ).toEqual( 'www.example.com' );
		} );

		it( 'should return an empty string if no wp_site INSERT statement is found', () => {
			const domain = getPrimaryDomain( statementNotFound );
			expect( domain ).toEqual( '' );
		} );

		it( 'should apply relevant search-replacements to the domain found in the wp_site INSERT statement', () => {
			const domain = getPrimaryDomain( capturedStatement, 'www.example.com,www.newdomain.com' );
			expect( domain ).toEqual( 'www.newdomain.com' );
		} );
	} );

	describe( 'isMultisitePrimaryDomainMapped', () => {
		beforeEach( () => {
			const {
				protocol,
				host,
				path,
			} = url.parse( API_URL );

			nock( `${ protocol }//${ host }` ).post( path ).reply( 200, {
				data: {
					app: {
						environments: [
							{
								domains: {
									nodes: [
										{
											name: 'www.example.com',
										},
									],
								},
							},
						],
					},
				},
			} );
		} );

		afterEach( nock.cleanAll );

		it( 'should return true if the domain is mapped to the environment', async () => {
			const isMapped = await isMultisitePrimaryDomainMapped( 1, 1, 'www.example.com' );
			expect( isMapped ).toEqual( true );
		} );

		it( 'should return false if the domain is not mapped to the environment', async () => {
			const isMapped = await isMultisitePrimaryDomainMapped( 1, 1, 'test.com' );
			expect( isMapped ).toEqual( false );
		} );
	} );
} );
