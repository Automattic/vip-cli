/**
 * @format
 */

import { once } from 'node:events';
import path from 'path';

import { getReadInterface } from '../../../src/lib/validations/line-by-line';
import { getMultilineStatement } from '../../../src/lib/validations/utils';

describe( 'utils', () => {
	describe( 'getMultilineStatement', () => {
		it( 'should return each occurance of a statement as an array of its lines', async () => {
			const sqlDumpPath = path.join(
				process.cwd(),
				'__fixtures__',
				'validations',
				'multiline-statements.sql'
			);
			const readInterface = await getReadInterface( sqlDumpPath );

			const getStatementsByLine = getMultilineStatement( /INSERT INTO wp_blogs/s );

			let statements;
			readInterface.on( 'line', line => {
				statements = getStatementsByLine( line );
			} );

			await once( readInterface, 'close' );

			// expecting the correct number of matching statements
			expect( statements ).toHaveLength( 4 );
			// expecting the statement to have the right number of lines
			expect( statements[ 0 ] ).toHaveLength( 1 );
			expect( statements[ 1 ] ).toHaveLength( 3 );
			expect( statements[ 2 ] ).toHaveLength( 4 );
			expect( statements[ 3 ] ).toHaveLength( 5 );
		} );

		it( 'should accurately capture the statement', async () => {
			const sqlDumpPath = path.join(
				process.cwd(),
				'__fixtures__',
				'validations',
				'multiline-statements.sql'
			);
			const readInterface = await getReadInterface( sqlDumpPath );

			const getStatementsByLine = getMultilineStatement( /INSERT INTO `wp_site`/s );

			let statements;
			readInterface.on( 'line', line => {
				statements = getStatementsByLine( line );
			} );

			await once( readInterface, 'close' );

			expect( statements[ 0 ].join( '' ).replace( /\s/g, '' ) ).toBe(
				"INSERTINTO`wp_site`(`id`,`domain`,`path`)VALUES(1,'www.example.com','/');"
			);
		} );
	} );
} );
