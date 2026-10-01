import { DevEnvImportSQLCommand } from '../../src/commands/dev-env-import-sql';
import * as uploader from '../../src/lib/client-file-uploader';
import * as database from '../../src/lib/database';
import * as cli from '../../src/lib/dev-environment/dev-environment-cli';
import * as core from '../../src/lib/dev-environment/dev-environment-core';
import { sanitizeImportedCredentials } from '../../src/lib/dev-environment/dev-environment-database';
import * as lando from '../../src/lib/dev-environment/dev-environment-lando';

import type Lando from 'lando';

describe( 'local import credential sanitation', () => {
	beforeEach( () => {
		jest
			.spyOn( lando, 'bootstrapLando' )
			.mockResolvedValue( { config: { domain: 'test' }, tasks: [ { command: 'ssh' } ] } as Lando );
		jest.spyOn( cli, 'validateDependencies' ).mockImplementation( () => undefined );
		jest
			.spyOn( uploader, 'getFileMeta' )
			.mockResolvedValue( { isCompressed: false } as Awaited<
				ReturnType< typeof uploader.getFileMeta >
			> );
		jest.spyOn( core, 'resolveImportPath' ).mockResolvedValue( __filename );
		jest
			.spyOn( core, 'readEnvironmentData' )
			.mockReturnValue( { adminPassword: 'test-password' } as ReturnType<
				typeof core.readEnvironmentData
			> );
		jest.spyOn( core, 'exec' ).mockResolvedValue( undefined );
		jest.spyOn( lando, 'landoShell' ).mockResolvedValue( undefined );
	} );
	afterEach( () => jest.restoreAllMocks() );

	it.each( [ database.SqlDumpType.MYSQLDUMP, database.SqlDumpType.MYDUMPER ] )(
		'sanitizes %s before any WordPress command, even without Jetpack',
		async type => {
			jest.spyOn( database, 'getSqlDumpDetails' ).mockResolvedValue( { type, sourceDb: 'source' } );
			await new DevEnvImportSQLCommand(
				'dump.sql',
				{ quiet: true, skipValidate: true, inPlace: false },
				'e'
			).run();
			const commands = jest.mocked( core.exec ).mock.calls.map( call => call[ 2 ] );
			const sanitation = commands.findIndex(
				args => args[ 0 ] === 'db' && args.includes( '--execute' )
			);
			const firstWordPress = commands.findIndex( args => args[ 0 ] === 'wp' );
			expect( sanitation ).toBeGreaterThan( 0 );
			expect( firstWordPress ).toBeGreaterThan( sanitation );
			expect( commands[ sanitation ].join( ' ' ) ).toContain( 'jetpack_private_options' );
			const cacheOrder = jest.mocked( lando.landoShell ).mock.invocationCallOrder[ 0 ];
			expect( cacheOrder ).toBeGreaterThan(
				jest.mocked( core.exec ).mock.invocationCallOrder[ sanitation ]
			);
			expect( cacheOrder ).toBeLessThan(
				jest.mocked( core.exec ).mock.invocationCallOrder[ firstWordPress ]
			);
		}
	);

	it( 'stops before WordPress when sanitation fails', async () => {
		jest
			.spyOn( database, 'getSqlDumpDetails' )
			.mockResolvedValue( { type: database.SqlDumpType.MYSQLDUMP, sourceDb: undefined } );
		jest.mocked( core.exec ).mockImplementation( ( _lando, _slug, args ) => {
			if ( args.join( ' ' ).includes( 'CREATE PROCEDURE' ) ) {
				return Promise.reject( new Error( 'database refused cleanup' ) );
			}
			return Promise.resolve( undefined );
		} );
		await expect(
			new DevEnvImportSQLCommand(
				'dump.sql',
				{ quiet: true, skipValidate: true, inPlace: false },
				'e'
			).run()
		).rejects.toThrow( 'credential cleanup failed' );
		expect( jest.mocked( core.exec ).mock.calls.some( call => call[ 2 ][ 0 ] === 'wp' ) ).toBe(
			false
		);
	} );
} );

describe( 'cached imported credentials', () => {
	it( 'rejects a missing shell task rather than skipping cache invalidation', async () => {
		const sql = jest.spyOn( core, 'exec' ).mockResolvedValue( undefined );
		try {
			await expect(
				sanitizeImportedCredentials( { tasks: [] } as unknown as Lando, 'e' )
			).rejects.toThrow( 'Lando shell task is unavailable' );
		} finally {
			sql.mockRestore();
		}
	} );

	it( 'stops before WordPress when the direct cache flush fails', async () => {
		const sql = jest.spyOn( core, 'exec' ).mockResolvedValue( undefined );
		const shell = jest
			.spyOn( lando, 'landoShell' )
			.mockRejectedValue( new Error( 'cache unavailable' ) );
		try {
			await expect(
				sanitizeImportedCredentials( { tasks: [ { command: 'ssh' } ] } as Lando, 'e' )
			).rejects.toThrow( 'credential cleanup failed' );
			expect( sql.mock.calls.some( call => call[ 2 ][ 0 ] === 'wp' ) ).toBe( false );
		} finally {
			sql.mockRestore();
			shell.mockRestore();
		}
	} );
} );
