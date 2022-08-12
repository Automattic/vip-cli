/**
 * @format
 */

/**
 * External dependencies
 */
import path from 'path';

/**
 * Internal dependencies
 */
import { getMultilineStatement } from 'lib/validations/utils';
import { getReadInterface } from 'lib/validations/line-by-line';

describe( 'utils', () => {
	describe( 'getMultilineStatement', () => {
		it( 'should return each occurance of a statement as an array of its lines', async () => {
			const sqlDumpPath = path.join( process.cwd(), '__fixtures__', 'validations', 'multiline-statements.sql' );
			const readInterface = await getReadInterface( sqlDumpPath );

			const getStatementsByLine = getMultilineStatement( /INSERT INTO wp_blogs/s );

			let statements;
			readInterface.on( 'line', line => {
				statements = getStatementsByLine( line );
			} );

			await new Promise( resolveBlock => readInterface.on( 'close', resolveBlock ) );

			// expecting the correct number of matching statements
			expect( statements ).toHaveLength( 4 );
			// expecting the statement to have the right number of lines
			expect( statements[ 0 ] ).toHaveLength( 1 );
			expect( statements[ 1 ] ).toHaveLength( 3 );
			expect( statements[ 2 ] ).toHaveLength( 4 );
			expect( statements[ 3 ] ).toHaveLength( 5 );
		} );

		it( 'should accurately capture the statement', async () => {
			const sqlDumpPath = path.join( process.cwd(), '__fixtures__', 'validations', 'multiline-statements.sql' );
			const readInterface = await getReadInterface( sqlDumpPath );

			const getStatementsByLine = getMultilineStatement( /INSERT INTO `wp_site`/s );

			let statements;
			readInterface.on( 'line', line => {
				statements = getStatementsByLine( line );
			} );

			await new Promise( resolveBlock => readInterface.on( 'close', resolveBlock ) );
			expect( statements[ 0 ].join( '' ).replace( /\s/g, '' ) ).toBe( "INSERTINTO`wp_site`(`id`,`domain`,`path`)VALUES(1,'www.example.com','/');" );
		} );
	} );
} );
