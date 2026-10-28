/* eslint-disable jest/no-conditional-expect, no-await-in-loop */
import { replace } from '@automattic/vip-search-replace';
import fs from 'fs';
import Lando from 'lando';
import os from 'node:os';
import path from 'path';

import { DevEnvImportSQLCommand } from '../../src/commands/dev-env-import-sql';
import { DevEnvSyncSQLCommand, findSiteHomeUrl } from '../../src/commands/dev-env-sync-sql';
import { ExportSQLCommand } from '../../src/commands/export-sql';
import * as exit from '../../src/lib/cli/exit';
import * as clientFileUploader from '../../src/lib/client-file-uploader';
import * as utils from '../../src/lib/utils';

jest.mock( '@automattic/vip-search-replace', () => {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { PassThrough } = require( 'node:stream' ) as typeof import('node:stream');
	return {
		replace: jest.fn( ( ...args ) => {
			return Promise.resolve( new PassThrough().pipe( args[ 0 ] ) );
		} ),
	};
} );

describe( 'commands/DevEnvSyncSQLCommand', () => {
	beforeEach( () => {
		jest.spyOn( console, 'log' ).mockImplementation( () => {} );
		jest
			.spyOn( utils, 'makeTempDir' )
			.mockImplementation( () => fs.mkdtempSync( path.join( os.tmpdir(), 'vip-sync-test-' ) ) );
	} );
	afterEach( () => {
		jest.restoreAllMocks();
	} );
	const app = { id: 123, name: 'test-app' };
	const env = { id: 456, name: 'test-env', wpSitesSDS: {} };
	const msEnv = {
		id: 456,
		name: 'test-env',
		wpSitesSDS: {
			nodes: [
				{
					blogId: 1,
					homeUrl: 'https://test.go-vip.com',
				},
				{
					blogId: 2,
					homeUrl: 'https://subsite.com',
				},
				{
					blogId: 3,
					homeUrl: 'https://another.com/path',
				},
				{
					blogId: 4,
					homeUrl: 'https://test.go-vip.com/path',
				},
			],
		},
	};

	const lando = new Lando( { domain: 'vipdev.lndo.site' } );
	const tempDirs: string[] = [];
	const makeCommand = ( selectedEnv: typeof env ) => {
		const command = new DevEnvSyncSQLCommand( app, selectedEnv, 'test-slug', lando );
		tempDirs.push( command.tmpDir );
		return command;
	};
	afterAll( async () => {
		await Promise.all(
			tempDirs.map( dir => fs.promises.rm( dir, { recursive: true, force: true } ) )
		);
	} );

	describe( '.generateExport', () => {
		it( 'should create an instance of ExportSQLCommand and run', async () => {
			const mockExport = jest.spyOn( ExportSQLCommand.prototype, 'run' );
			mockExport.mockResolvedValue();

			const cmd = makeCommand( env );
			await cmd.generateExport();

			expect( mockExport ).toHaveBeenCalled();
		} );
	} );

	describe( 'generateSearchReplaceMap', () => {
		it( 'should return a map of search-replace values', () => {
			const cmd = makeCommand( env );
			cmd.slug = 'test-slug';
			cmd.siteUrls = [ 'http://test.go-vip.com' ];
			cmd.generateSearchReplaceMap();

			expect( cmd.searchReplaceMap ).toEqual( { 'test.go-vip.com': 'test-slug.vipdev.lndo.site' } );
		} );

		it( 'should return a map of search-replace values for multisite', () => {
			const cmd = makeCommand( msEnv );
			cmd.slug = 'test-slug';
			cmd.sdsSiteUrls = msEnv.wpSitesSDS.nodes;
			cmd.siteUrls = msEnv.wpSitesSDS.nodes.map( node => node.homeUrl );
			cmd.generateSearchReplaceMap();

			expect( cmd.searchReplaceMap ).toEqual( {
				'test.go-vip.com': 'test-slug.vipdev.lndo.site',
				'subsite.com': 'subsite-com.test-slug.vipdev.lndo.site',
				'another.com/path': 'another-com.test-slug.vipdev.lndo.site/path',
				'test.go-vip.com/path': 'test-slug.vipdev.lndo.site/path',
			} );
		} );
	} );

	describe( '.runSearchReplace', () => {
		it( 'should run search-replace operation on the mysqldump file', async () => {
			const cmd = makeCommand( env );
			fs.copyFileSync(
				path.join( __dirname, '../../__fixtures__/dev-env-e2e/mysqldump-detection.sql.gz' ),
				cmd.gzFile
			);
			fs.copyFileSync(
				path.join( __dirname, '../../__fixtures__/dev-env-e2e/mysqldump-detection.sql' ),
				cmd.sqlFile
			);
			await cmd.initSqlDumpType();
			cmd.searchReplaceMap = { 'test.go-vip.com': 'test-slug.vipdev.lndo.site' };
			cmd.slug = 'test-slug';

			await cmd.runSearchReplace();
			expect( replace ).toHaveBeenCalledWith( expect.any( Object ), [
				'test.go-vip.com',
				'test-slug.vipdev.lndo.site',
			] );
		} );

		it( 'should run search-replace operation on the mydumper file', async () => {
			const cmd = makeCommand( env );
			fs.copyFileSync(
				path.join( __dirname, '../../__fixtures__/dev-env-e2e/mydumper-detection.sql.gz' ),
				cmd.gzFile
			);
			fs.copyFileSync(
				path.join( __dirname, '../../__fixtures__/dev-env-e2e/mydumper-detection.sql' ),
				cmd.sqlFile
			);
			await cmd.initSqlDumpType();
			cmd.searchReplaceMap = { 'test.go-vip.com': 'test-slug.vipdev.lndo.site' };
			cmd.slug = 'test-slug';

			await cmd.runSearchReplace();
			expect( replace ).toHaveBeenCalledWith( expect.any( Object ), [
				'test.go-vip.com',
				'test-slug.vipdev.lndo.site',
			] );

			const fileContentExpected = fs.readFileSync(
				path.join( __dirname, '../../__fixtures__/dev-env-e2e/mydumper-detection.expected.sql' ),
				'utf8'
			);
			const fileContent = fs.readFileSync( cmd.sqlFile, 'utf8' );

			expect( fileContent ).toBe( fileContentExpected );
		} );
	} );

	describe( '.runImport', () => {
		it( 'should create an instance of DevEnvImportSQLCommand and run', async () => {
			const mockImport = jest.spyOn( DevEnvImportSQLCommand.prototype, 'run' );
			mockImport.mockResolvedValue();

			const cmd = makeCommand( env );
			await cmd.runImport();

			expect( mockImport ).toHaveBeenCalled();
		} );
	} );

	describe( '.run', () => {
		const setup = () => {
			const command = makeCommand( env );
			fs.copyFileSync(
				path.join( __dirname, '../../__fixtures__/dev-env-e2e/mysqldump-detection.sql' ),
				command.sqlFile
			);
			const stages = {
				export: jest.spyOn( command, 'generateExport' ).mockResolvedValue(),
				extract: jest
					.spyOn( clientFileUploader, 'unzipFile' )
					.mockResolvedValue( undefined as never ),
				dumpType: jest.spyOn( command, 'initSqlDumpType' ).mockResolvedValue(),
				sds: jest.spyOn( command, 'getSiteUrlsFromSDS' ).mockResolvedValue( [] ),
				mapping: jest.spyOn( command, 'generateSearchReplaceMap' ).mockImplementation( () => {} ),
				replace: jest.spyOn( command, 'runSearchReplace' ).mockResolvedValue(),
				import: jest.spyOn( command, 'runImport' ).mockResolvedValue(),
			};
			jest.spyOn( exit, 'withError' ).mockImplementation( message => {
				throw new Error( String( message ) );
			} );
			return { command, stages };
		};

		it( 'waits for export, extraction, replacement and import in order', async () => {
			const { command, stages } = setup();
			const events: string[] = [];
			const names = [ 'export', 'extract', 'replace', 'import' ] as const;
			const gates = names.map( name => {
				let release!: () => void;
				let notify!: () => void;
				const wait = new Promise< void >( resolve => {
					release = resolve;
				} );
				const started = new Promise< void >( resolve => {
					notify = resolve;
				} );
				stages[ name ].mockImplementation( async () => {
					events.push( `${ name }:start` );
					notify();
					await wait;
					events.push( `${ name }:done` );
				} );
				return { started, release };
			} );
			const running = command.run();
			for ( const [ index, gate ] of gates.entries() ) {
				await gate.started;
				expect( events ).toEqual(
					names
						.slice( 0, index )
						.flatMap( name => [ `${ name }:start`, `${ name }:done` ] )
						.concat( `${ names[ index ] }:start` )
				);
				gate.release();
			}
			await expect( running ).resolves.toBe( true );
			expect( events ).toEqual( names.flatMap( name => [ `${ name }:start`, `${ name }:done` ] ) );
		} );

		it.each( [
			'export',
			'extract',
			'dumpType',
			'urls',
			'sds',
			'mapping',
			'replace',
			'import',
		] as const )( 'stops downstream stages after %s fails', async failing => {
			const { command, stages } = setup();
			if ( failing === 'urls' ) fs.unlinkSync( command.sqlFile );
			else if ( failing === 'mapping' )
				stages.mapping.mockImplementation( () => {
					throw new Error( 'stage failed' );
				} );
			else stages[ failing ].mockRejectedValueOnce( new Error( 'stage failed' ) );
			await expect( command.run() ).rejects.toThrow();
			const order = [
				'export',
				'extract',
				'dumpType',
				'urls',
				'sds',
				'mapping',
				'replace',
				'import',
			];
			for ( const name of order.slice( order.indexOf( failing ) + 1 ) ) {
				if ( name !== 'urls' )
					expect( stages[ name as keyof typeof stages ] ).not.toHaveBeenCalled();
			}
			expect( console.log ).not.toHaveBeenCalledWith(
				expect.stringContaining( 'SQL file imported' )
			);
			if ( order.indexOf( failing ) <= order.indexOf( 'replace' ) ) {
				expect( console.log ).not.toHaveBeenCalledWith(
					expect.stringContaining( 'Search-replace operation is complete' )
				);
			}
		} );
	} );
} );

describe( 'findSiteHomeUrl', () => {
	it.each( [
		[ `'siteurl', 'https://test.go-vip.com'`, 'https://test.go-vip.com' ],
		[ `"siteurl", "https://test.go-vip.com"`, 'https://test.go-vip.com' ],
		[ `'siteurl', "https://test.go-vip.com"`, null ],
		[ `'home',    'HtTp://test.go-vip.com'`, 'HtTp://test.go-vip.com' ],
		[ `'home','HTTP://test.go-vip.com'`, 'HTTP://test.go-vip.com' ],
		[ `'home','Photo: istockphoto.com'`, null ],
	] )( 'should return the correct home URL for %s', ( input, expected ) => {
		const actual = findSiteHomeUrl( input );
		expect( actual ).toBe( expected );
	} );
} );
