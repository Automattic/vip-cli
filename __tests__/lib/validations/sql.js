import debugLib from 'debug';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { validate } from '../../../src/lib/validations/sql';

const debug = debugLib( '@automattic/vip:__tests__:validations:sql' );

// Mock console.log()
let output;
global.console = {
	log: message => ( output += message + '\n' ),
	error: message => ( output += message + '\n' ),
};
jest.spyOn( global.console, 'log' );

const mockExit = jest.spyOn( process, 'exit' ).mockImplementation( () => {} );
const ERROR_CODE = 1;

jest.mock( '../../../src/lib/tracker', () => ( {
	trackEvent: jest.fn().mockResolvedValue( [] ),
} ) );
describe( 'lib/validations/sql', () => {
	describe( 'it validates SQL for dev-env without false-positive USE statements', () => {
		let tempDir;
		let sqlBytes;

		beforeAll( async () => {
			tempDir = await mkdtemp( path.join( os.tmpdir(), 'vip-cli-sql-validation-' ) );
			const sqlFilePath = path.join( tempDir, 'u2028-use-string.sql' );
			sqlBytes = Buffer.concat( [
				Buffer.from(
					'DROP TABLE IF EXISTS `wp_options`;\n' +
						'CREATE TABLE `wp_options` (\n' +
						'  `option_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,\n' +
						"  `option_name` varchar(191) NOT NULL DEFAULT '',\n" +
						'  `option_value` longtext NOT NULL,\n' +
						"  `autoload` varchar(20) NOT NULL DEFAULT 'yes',\n" +
						'  PRIMARY KEY (`option_id`)\n' +
						') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n' +
						"INSERT INTO `wp_options` (`option_name`, `option_value`, `autoload`) VALUES ('siteurl', 'http://test.domain', 'yes');\n" +
						"INSERT INTO `wp_options` (`option_name`, `option_value`, `autoload`) VALUES ('home', 'http://test.domain', 'yes');\n" +
						"INSERT INTO `wp_options` (`option_name`, `option_value`, `autoload`) VALUES ('description', 'Line separator ",
					'utf8'
				),
				Buffer.from( [ 0xe2, 0x80, 0xa8 ] ),
				Buffer.from( "Use Cases for VIP CLI', 'yes');\n", 'utf8' ),
			] );

			await writeFile( sqlFilePath, sqlBytes );

			output = '';
			mockExit.mockClear();

			let isolatedValidate;
			jest.isolateModules( () => {
				( { validate: isolatedValidate } = require( '../../../src/lib/validations/sql' ) );
			} );

			await isolatedValidate( sqlFilePath, {
				isImport: false,
				skipChecks: [],
				extraCheckParams: { siteHomeUrlLando: 'test.domain' },
			} );
		} );

		afterAll( async () => {
			if ( tempDir ) {
				await rm( tempDir, { recursive: true, force: true } );
			}
		} );

		it( 'does not reject text after U+2028 inside an INSERT value as a USE statement', () => {
			expect( sqlBytes.includes( Buffer.from( [ 0xe2, 0x80, 0xa8 ] ) ) ).toBe( true );
			expect( mockExit ).not.toHaveBeenCalled();
			expect( output ).not.toContain( 'USE <DATABASE_NAME> statement on' );
		} );
	} );

	describe( 'it fails when the SQL has (using bad-sql-dump.sql)', () => {
		beforeAll( async () => {
			try {
				output = '';
				const badSqlDumpPath = path.join(
					process.cwd(),
					'__fixtures__',
					'validations',
					'bad-sql-dump.sql'
				);
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
		it( 'use statement should be ok', () => {
			expect( output ).not.toContain(
				"'USE <DATABASE_NAME>' should not be present (case-insensitive)"
			);
		} );
		it( 'instances of ALTER TABLE statements', () => {
			expect( output ).toContain( 'ALTER TABLE statement on line(s) 36' );
		} );
		it( 'instances SET UNIQUE_CHECKS = 0', () => {
			expect( output ).toContain( 'SET UNIQUE_CHECKS = 0 on line(s) 41' );
		} );
	} );
	describe( 'it fails when the SQL has (using bad-sql-duplicate-tables.sql)', () => {
		beforeAll( async () => {
			try {
				output = '';
				const duplicateCreateTableSqlDumpPath = path.join(
					process.cwd(),
					'__fixtures__',
					'validations',
					'bad-sql-duplicate-tables.sql'
				);
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
	describe( 'it fails when the SQL for dev-env has (using bad-sql-dev-env.sql)', () => {
		beforeAll( async () => {
			try {
				output = '';
				const sqlFileDumpPath = path.join(
					process.cwd(),
					'__fixtures__',
					'validations',
					'bad-sql-dev-env.sql'
				);
				await validate( sqlFileDumpPath, {
					isImport: false,
					skipChecks: [],
					extraCheckParams: { siteHomeUrlLando: 'test.domain' },
				} );
			} catch ( err ) {
				debug( 'Error:', err.toString() );
			}
			debug( 'output', output );
		} );
		it( 'use statement', () => {
			expect( output ).toContain( 'USE <DATABASE_NAME> statement on' );
		} );
		it( 'not correct siteUrl', () => {
			expect( output ).toContain( 'Siteurl/home options not pointing to lando domain' );
			expect( output ).toContain(
				'Use \'--search-replace="super-empoyees.com,test.domain"\' switch to replace the domain'
			);
		} );
		// https://github.com/Automattic/vip-cli/issues/1906
		it( 'should not suggest to replace non-URLs', () => {
			expect( output ).not.toContain(
				'Use \'--search-replace="home,test.domain"\' switch to replace the domain'
			);
		} );
		it( 'should not suggest to replace home strings from non-options tables', () => {
			expect( output ).not.toContain(
				'Use \'--search-replace="unrelated-table.example,test.domain"\' switch to replace the domain'
			);
		} );
		it( 'should not suggest replacements for unrelated options rows containing quoted home URL text', () => {
			expect( output ).not.toContain(
				'Use \'--search-replace="embedded.example,test.domain"\' switch to replace the domain'
			);
		} );
		it( 'should suggest replacements for option rows inserted with supported statement variants', () => {
			expect( output ).toContain(
				'Use \'--search-replace="full-order.example,test.domain"\' switch to replace the domain'
			);
			expect( output ).toContain(
				'Use \'--search-replace="split-header.example,test.domain"\' switch to replace the domain'
			);
			expect( output ).toContain(
				'Use \'--search-replace="replace.example,test.domain"\' switch to replace the domain'
			);
			expect( output ).toContain(
				'Use \'--search-replace="ignore.example,test.domain"\' switch to replace the domain'
			);
			expect( output ).toContain(
				'Use \'--search-replace="qualified.example,test.domain"\' switch to replace the domain'
			);
			expect( output ).toContain(
				'Use \'--search-replace="network.example,test.domain"\' switch to replace the domain'
			);
		} );
		it( 'should suggest replacements for explicit option column lists split across multiple lines', () => {
			expect( output ).toContain(
				'Use \'--search-replace="multi-line-columns.example,test.domain"\' switch to replace the domain'
			);
		} );
		it( 'should pair option values by explicit column name instead of fixed position', () => {
			expect( output ).toContain(
				'Use \'--search-replace="reordered.example,test.domain"\' switch to replace the domain'
			);
			expect( output ).not.toContain(
				'Use \'--search-replace="unpaired-neighbor.example,test.domain"\' switch to replace the domain'
			);
		} );
		it( 'should suggest replacements for option tuples split across multiple lines', () => {
			expect( output ).toContain(
				'Use \'--search-replace="multi-line-tuple.example,test.domain"\' switch to replace the domain'
			);
		} );
		it( 'should not suggest replacements from comment-shaped option rows', () => {
			expect( output ).not.toContain(
				'Use \'--search-replace="dash-comment.example,test.domain"\' switch to replace the domain'
			);
			expect( output ).not.toContain(
				'Use \'--search-replace="hash-comment.example,test.domain"\' switch to replace the domain'
			);
			expect( output ).not.toContain(
				'Use \'--search-replace="block-comment.example,test.domain"\' switch to replace the domain'
			);
		} );
		it( 'should not suggest replacements from trailing inline comment option rows', () => {
			expect( output ).not.toContain(
				'Use \'--search-replace="dash-inline-comment.example,test.domain"\' switch to replace the domain'
			);
			expect( output ).not.toContain(
				'Use \'--search-replace="hash-inline-comment.example,test.domain"\' switch to replace the domain'
			);
			expect( output ).not.toContain(
				'Use \'--search-replace="block-inline-comment.example,test.domain"\' switch to replace the domain'
			);
		} );
		it( 'should not suggest replacements from multiline block comment option rows', () => {
			expect( output ).not.toContain(
				'Use \'--search-replace="top-level-commented-insert.example,test.domain"\' switch to replace the domain'
			);
			expect( output ).toContain(
				'Use \'--search-replace="after-top-level-block.example,test.domain"\' switch to replace the domain'
			);
			expect( output ).not.toContain(
				'Use \'--search-replace="commented-insert.example,test.domain"\' switch to replace the domain'
			);
			expect( output ).not.toContain(
				'Use \'--search-replace="multiline-block-comment.example,test.domain"\' switch to replace the domain'
			);
			expect( output ).not.toContain(
				'Use \'--search-replace="multiline-block-home-comment.example,test.domain"\' switch to replace the domain'
			);
			expect( output ).toContain(
				'Use \'--search-replace="after-multiline-block.example,test.domain"\' switch to replace the domain'
			);
		} );
		it( 'should preserve comment markers inside quoted option values', () => {
			expect( output ).toContain(
				'Use \'--search-replace="quoted-dash.example/path--kept,test.domain"\' switch to replace the domain'
			);
			expect( output ).toContain(
				'Use \'--search-replace="quoted-hash.example/path#kept,test.domain"\' switch to replace the domain'
			);
			expect( output ).toContain(
				'Use \'--search-replace="quoted-block.example/path/*kept*/,test.domain"\' switch to replace the domain'
			);
		} );
		it( 'should not suggest replacements for non-numeric pseudo-options tables', () => {
			expect( output ).not.toContain(
				'Use \'--search-replace="pseudo.example,test.domain"\' switch to replace the domain'
			);
		} );
	} );

	describe( 'it fails when the import file is compressed', () => {
		it( '.zip', async () => {
			const compressedFilePath = path.join(
				process.cwd(),
				'__fixtures__',
				'validations',
				'empty.zip'
			);

			await validate( compressedFilePath );
			expect( mockExit ).toHaveBeenCalledWith( ERROR_CODE );
		} );
	} );
} );
