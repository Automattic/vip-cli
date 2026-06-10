/**
 * @format
 */

import { DevEnvImportSQLCommand } from '../../src/commands/dev-env-import-sql';
import { SqlDumpType } from '../../src/lib/database';

describe( 'commands/DevEnvImportSQLCommand', () => {
	describe( '.getImportArgs', () => {
		const command = new DevEnvImportSQLCommand(
			'dump.sql',
			{ inPlace: false, skipValidate: true, quiet: true },
			'test-slug'
		);

		it( 'uses the mysql client for mysqldump files', () => {
			const args = command.getImportArgs( { type: SqlDumpType.MYSQLDUMP, sourceDb: undefined } );
			expect( args[ 0 ] ).toBe( 'db' );
		} );

		it( 'passes -o (not --overwrite-tables) to myloader for mydumper files', () => {
			const args = command.getImportArgs( {
				type: SqlDumpType.MYDUMPER,
				sourceDb: 'some_db',
			} );

			expect( args[ 0 ] ).toBe( 'db-myloader' );
			// `-o` drops existing tables on every myloader version;
			// `--overwrite-tables` became a silent no-op in myloader >= 0.20.
			expect( args ).toContain( '-o' );
			expect( args ).not.toContain( '--overwrite-tables' );
			expect( args ).toContain( '--source-db=some_db' );
			expect( args ).toContain( '--stream' );
		} );
	} );
} );
