import debugLib from 'debug';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const debug = debugLib( '@automattic/vip:__tests__:validations:sql' );

// Mock console.log()
let output;
global.console = {
	log: message => ( output += message + '\n' ),
	error: message => ( output += message + '\n' ),
};
jest.spyOn( global.console, 'log' );
jest.spyOn( global.console, 'error' );

const mockExit = jest.spyOn( process, 'exit' ).mockImplementation( () => {} );
const ERROR_CODE = 1;

function resetObservations() {
	output = '';
	mockExit.mockClear();
	console.log.mockClear();
	console.error.mockClear();
}

jest.mock( '../../../src/lib/tracker', () => ( {
	trackEvent: jest.fn().mockResolvedValue( [] ),
} ) );
jest.mock( '@wwa/single-line-log', () => ( { stdout: jest.fn() } ) );

function freshValidate() {
	let validate;
	jest.isolateModules( () => {
		( { validate } = require( '../../../src/lib/validations/sql' ) );
	} );
	return validate;
}

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

			resetObservations();

			await freshValidate()( sqlFilePath, {
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
			resetObservations();
			try {
				const badSqlDumpPath = path.join(
					process.cwd(),
					'__fixtures__',
					'validations',
					'bad-sql-dump.sql'
				);
				// const duplicateCreateTableSqlDumpPath = path.join( process.cwd(), '__fixtures__', 'validations', 'bad-sql-duplicate-tables.sql' );
				await freshValidate()( badSqlDumpPath );
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
			resetObservations();
			try {
				const duplicateCreateTableSqlDumpPath = path.join(
					process.cwd(),
					'__fixtures__',
					'validations',
					'bad-sql-duplicate-tables.sql'
				);
				await freshValidate()( duplicateCreateTableSqlDumpPath );
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
			resetObservations();
			try {
				const sqlFileDumpPath = path.join(
					process.cwd(),
					'__fixtures__',
					'validations',
					'bad-sql-dev-env.sql'
				);
				await freshValidate()( sqlFileDumpPath, {
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
	} );

	describe( 'it fails when the import file is compressed', () => {
		it( '.zip', async () => {
			resetObservations();
			mockExit.mockImplementationOnce( () => {
				throw new Error( 'exit' );
			} );
			const compressedFilePath = path.join(
				process.cwd(),
				'__fixtures__',
				'validations',
				'empty.zip'
			);

			await expect( freshValidate()( compressedFilePath ) ).rejects.toThrow( 'exit' );
			expect( mockExit ).toHaveBeenCalledWith( ERROR_CODE );
			expect( output ).toContain( 'Compressed files cannot be validated.' );
		} );
	} );

	it( 'validates a clean fixture after an invalid one with fresh state', async () => {
		const dir = await mkdtemp( path.join( os.tmpdir(), 'vip-sql-fresh-' ) );
		try {
			const valid = path.join( dir, 'valid.sql' );
			await writeFile(
				valid,
				'DROP TABLE IF EXISTS `wp_posts`;\nCREATE TABLE `wp_posts` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB;\n'
			);
			resetObservations();
			await freshValidate()(
				path.join( process.cwd(), '__fixtures__', 'validations', 'bad-sql-dump.sql' )
			);
			expect( mockExit ).toHaveBeenCalledWith( ERROR_CODE );
			resetObservations();
			await freshValidate()( valid );
			expect( mockExit ).not.toHaveBeenCalled();
			expect( output ).not.toContain( 'TRIGGER statement on line(s) 16' );
		} finally {
			await rm( dir, { recursive: true, force: true } );
		}
	} );
} );
