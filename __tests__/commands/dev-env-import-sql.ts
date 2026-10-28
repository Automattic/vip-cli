/**
 * @format
 */

import { DevEnvImportSQLCommand } from '../../src/commands/dev-env-import-sql';
import * as uploader from '../../src/lib/client-file-uploader';
import { SqlDumpType } from '../../src/lib/database';
import * as database from '../../src/lib/database';
import * as cli from '../../src/lib/dev-environment/dev-environment-cli';
import * as core from '../../src/lib/dev-environment/dev-environment-core';
import * as lando from '../../src/lib/dev-environment/dev-environment-lando';
import * as sql from '../../src/lib/validations/sql';

describe( 'commands/DevEnvImportSQLCommand', () => {
	it( 'does not execute an import when validation rejects the dump', async () => {
		jest
			.spyOn( lando, 'bootstrapLando' )
			.mockResolvedValue( { config: { domain: 'test' } } as never );
		jest.spyOn( cli, 'validateDependencies' ).mockImplementation( () => {} );
		jest.spyOn( sql, 'validateImportFileExtension' ).mockImplementation( () => {} );
		jest
			.spyOn( database, 'getSqlDumpDetails' )
			.mockResolvedValue( { type: SqlDumpType.MYSQLDUMP, sourceDb: undefined } );
		jest.spyOn( uploader, 'getFileMeta' ).mockResolvedValue( { isCompressed: false } as never );
		jest.spyOn( core, 'resolveImportPath' ).mockResolvedValue( 'dump.sql' );
		jest.spyOn( lando, 'isContainerRunning' ).mockResolvedValue( true );
		jest.spyOn( sql, 'validate' ).mockRejectedValue( new Error( 'invalid dump' ) );
		const execute = jest.spyOn( core, 'exec' );
		const command = new DevEnvImportSQLCommand(
			'dump.sql',
			{ inPlace: false, skipValidate: false, quiet: true },
			'test'
		);
		await expect( command.run() ).rejects.toThrow( 'invalid dump' );
		expect( execute ).not.toHaveBeenCalled();
		jest.restoreAllMocks();
	} );
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
