import fs from 'fs';

import { DevEnvImportSQLCommand } from '../../src/commands/dev-env-import-sql';
import * as uploader from '../../src/lib/client-file-uploader';
import * as database from '../../src/lib/database';
import * as cli from '../../src/lib/dev-environment/dev-environment-cli';
import * as core from '../../src/lib/dev-environment/dev-environment-core';
import { sanitizeImportedCredentials } from '../../src/lib/dev-environment/dev-environment-database';
import * as lando from '../../src/lib/dev-environment/dev-environment-lando';

import type Lando from 'lando';

const openedInput = () =>
	jest.mocked( fs.promises.open ).mock.results[ 0 ].value as ReturnType< typeof fs.promises.open >;

describe( 'local import credential sanitation', () => {
	beforeEach( () => {
		jest.spyOn( fs.promises, 'open' );
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
	afterEach( async () => {
		// Clean up even when a regression causes a closure assertion to fail.
		await Promise.all(
			jest
				.mocked( fs.promises.open )
				.mock.results.filter( result => result.type === 'return' )
				.map( async result => {
					const handle = await result.value;
					await handle.close().catch( () => {} );
				} )
		);
		jest.restoreAllMocks();
	} );

	it.each( [ database.SqlDumpType.MYSQLDUMP, database.SqlDumpType.MYDUMPER ] )(
		'sanitizes %s before any WordPress command, even without Jetpack',
		async type => {
			jest.spyOn( database, 'getSqlDumpDetails' ).mockResolvedValue( { type, sourceDb: 'source' } );
			jest.mocked( lando.landoShell ).mockImplementation( async () => {
				const handle = await openedInput();
				expect( handle.fd ).toBe( -1 );
			} );
			await new DevEnvImportSQLCommand(
				'dump.sql',
				{ quiet: true, skipValidate: true, inPlace: false },
				'e'
			).run();
			const commands = jest.mocked( core.exec ).mock.calls.map( call => call[ 2 ] );
			const sanitation = jest.mocked( lando.landoShell ).mock.invocationCallOrder[ 0 ];
			const firstWordPress = commands.findIndex( args => args[ 0 ] === 'wp' );
			expect( sanitation ).toBeGreaterThan(
				jest.mocked( core.exec ).mock.invocationCallOrder[ 0 ]
			);
			expect( jest.mocked( lando.landoShell ).mock.calls[ 0 ][ 4 ] ).toEqual( [
				'php',
				'/dev-tools/import-cleanup.php',
			] );
			expect( sanitation ).toBeLessThan(
				jest.mocked( core.exec ).mock.invocationCallOrder[ firstWordPress ]
			);
		}
	);

	it.each( [ database.SqlDumpType.MYSQLDUMP, database.SqlDumpType.MYDUMPER ] )(
		'stops before WordPress when %s sanitation fails',
		async type => {
			jest.spyOn( database, 'getSqlDumpDetails' ).mockResolvedValue( { type, sourceDb: 'source' } );
			jest.mocked( lando.landoShell ).mockRejectedValue( new Error( 'cleanup failed' ) );
			await expect(
				new DevEnvImportSQLCommand(
					'dump.sql',
					{ quiet: true, skipValidate: true, inPlace: false },
					'e'
				).run()
			).rejects.toThrow( 'credential cleanup attempt failed' );
			const handle = await openedInput();
			expect( handle.fd ).toBe( -1 );
			expect( jest.mocked( core.exec ).mock.calls.some( call => call[ 2 ][ 0 ] === 'wp' ) ).toBe(
				false
			);
		}
	);

	it.each( [ database.SqlDumpType.MYSQLDUMP, database.SqlDumpType.MYDUMPER ] )(
		'closes the input and preserves the error when %s import fails',
		async type => {
			jest.spyOn( database, 'getSqlDumpDetails' ).mockResolvedValue( { type, sourceDb: 'source' } );
			const error = new Error( 'import failed' );
			jest.mocked( core.exec ).mockRejectedValue( error );
			const originalIsTTY = process.stdin.isTTY;
			await expect(
				new DevEnvImportSQLCommand(
					'dump.sql',
					{ quiet: true, skipValidate: true, inPlace: false },
					'e'
				).run()
			).rejects.toBe( error );
			const handle = await openedInput();
			expect( handle.fd ).toBe( -1 );
			expect( lando.landoShell ).not.toHaveBeenCalled();
			expect( process.stdin.isTTY ).toBe( originalIsTTY );
		}
	);

	it.each( [ false, true ] )(
		'handles a close failure with import failure=%s',
		async importFails => {
			jest.spyOn( database, 'getSqlDumpDetails' ).mockResolvedValue( {
				type: database.SqlDumpType.MYSQLDUMP,
				sourceDb: undefined,
			} );
			const importError = new Error( 'import failed' );
			const closeError = new Error( 'close failed' );
			const close = jest.fn().mockRejectedValue( closeError );
			jest
				.mocked( fs.promises.open )
				.mockResolvedValue( { fd: 123, close } as unknown as Awaited<
					ReturnType< typeof fs.promises.open >
				> );
			if ( importFails ) jest.mocked( core.exec ).mockRejectedValue( importError );
			const originalIsTTY = process.stdin.isTTY;
			await expect(
				new DevEnvImportSQLCommand(
					'dump.sql',
					{ quiet: true, skipValidate: true, inPlace: false },
					'e'
				).run()
			).rejects.toBe( importFails ? importError : closeError );
			expect( close ).toHaveBeenCalledTimes( 1 );
			expect( lando.landoShell ).not.toHaveBeenCalled();
			expect( process.stdin.isTTY ).toBe( originalIsTTY );
		}
	);
} );

it( 'rejects an unavailable Lando shell task', async () => {
	await expect(
		sanitizeImportedCredentials( { tasks: [] } as unknown as Lando, 'e' )
	).rejects.toThrow( 'Lando shell task is unavailable' );
} );
