/**
 * @format
 */

/**
 * External dependencies
 */
import path from 'path';
import debugLib from 'debug';
import fetch, { Response } from 'node-fetch';

/**
 * Internal dependencies
 */
import { validate } from 'lib/validations/sql';

const debug = debugLib( '@automattic/vip:__tests__:validations:sql' );

// Mock console.log()
let output;
global.console = {
	log: message => output += message + '\n',
	error: message => output += message + '\n',
};
jest.spyOn( global.console, 'log' );

const mockExit = jest.spyOn( process, 'exit' ).mockImplementation( () => {} );
const ERROR_CODE = 1;

jest.mock( 'node-fetch' );
fetch.mockReturnValue( Promise.resolve( new Response( 'ok' ) ) );

describe( 'lib/validations/sql', () => {
	describe( 'it fails when the SQL has (using bad-sql-dump.sql)', () => {
		beforeAll( async () => {
			try {
				output = '';
				const badSqlDumpPath = path.join( process.cwd(), '__fixtures__', 'validations', 'bad-sql-dump.sql' );
				// const duplicateCreateTableSqlDumpPath = path.join( process.cwd(), '__fixtures__', 'validations', 'bad-sql-duplicate-tables.sql' );
				await validate( badSqlDumpPath );
			} catch ( err ) {
				debug( 'Error:', err.toString() );
			}
			debug( 'output', output );
		} );
		it( 'an error, and exits with code 1', () => {
			expect( mockExit ).toHaveBeenCalledWith( ERROR_CODE );
		} );
		it( 'instances of TRIGGER statements', () => {
			expect( output ).toContain( 'TRIGGER statement on line(s) 16' );
		} );
		it( 'instances of DROP DATABASE statements', () => {
			expect( output ).toContain( 'DROP DATABASE statement on line(s) 27' );
		} );
		it( 'instances of ALTER USER statements', () => {
			expect( output ).toContain( 'ALTER USER statement on line(s) 25' );
		} );
		it( 'instances of SET @@SESSION.sql_log_bin statements', () => {
			expect( output ).toContain( 'SET @@SESSION.sql_log_bin statement on line(s) 34' );
		} );
		it( 'no instances of DROP TABLE IF EXISTS statements', () => {
			expect( output ).toContain( 'DROP TABLE was not found' );
		} );
		it( 'no instances of CREATE TABLE statements', () => {
			expect( output ).toContain( 'CREATE TABLE was not found' );
		} );
		it( 'instances of ENGINE != InnoDB', () => {
			expect( output ).toContain( 'ENGINE != InnoDB on line(s) 14' );
		} );
	} );
	describe( 'it fails when the SQL has (using bad-sql-duplicate-tables.sql)', () => {
		beforeAll( async () => {
			try {
				output = '';
				const duplicateCreateTableSqlDumpPath = path.join( process.cwd(), '__fixtures__', 'validations', 'bad-sql-duplicate-tables.sql' );
				await validate( duplicateCreateTableSqlDumpPath );
			} catch ( err ) {
				debug( 'Error:', err.toString() );
			}
			debug( 'output', output );
		} );
		it( 'duplicate tables names found', () => {
			expect( output ).toContain( 'Duplicate table names were found: wp_users' );
		} );
	} );
} );
