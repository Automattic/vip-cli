import { replace } from '@automattic/vip-search-replace';
import fs from 'fs';
import Lando from 'lando';
import path from 'path';

import { DevEnvImportSQLCommand } from '../../src/commands/dev-env-import-sql';
import { DevEnvSyncSQLCommand, findSiteHomeUrl } from '../../src/commands/dev-env-sync-sql';
import { ExportSQLCommand } from '../../src/commands/export-sql';
import * as clientFileUploader from '../../src/lib/client-file-uploader';

jest.mock( '@automattic/vip-search-replace', () => {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const { PassThrough } = require( 'node:stream' ) as typeof import('node:stream');
	return {
		replace: jest.fn( ( ...args ) => {
			return Promise.resolve( new PassThrough().pipe( args[ 0 ] ) );
		} ),
	};
} );

jest.spyOn( clientFileUploader, 'unzipFile' );

jest.spyOn( console, 'log' ).mockImplementation( () => {} );

describe( 'commands/DevEnvSyncSQLCommand', () => {
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

	describe( '.generateExport', () => {
		it( 'should create an instance of ExportSQLCommand and run', async () => {
			const mockExport = jest.spyOn( ExportSQLCommand.prototype, 'run' );
			mockExport.mockResolvedValue();

			const cmd = new DevEnvSyncSQLCommand( app, env, 'test-slug', lando );
			await cmd.generateExport();

			expect( mockExport ).toHaveBeenCalled();
		} );
	} );

	describe( 'generateSearchReplaceMap', () => {
		it( 'should return a map of search-replace values', () => {
			const cmd = new DevEnvSyncSQLCommand( app, env, 'test-slug', lando );
			cmd.slug = 'test-slug';
			cmd.siteUrls = [ 'http://test.go-vip.com' ];
			cmd.generateSearchReplaceMap();

			expect( cmd.searchReplaceMap ).toEqual( { 'test.go-vip.com': 'test-slug.vipdev.lndo.site' } );
		} );

		it( 'should return a map of search-replace values for multisite', () => {
			const cmd = new DevEnvSyncSQLCommand( app, msEnv, 'test-slug', lando );
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

		it( 'should add user search-replace pairs to the map', () => {
			const cmd = new DevEnvSyncSQLCommand( app, env, 'test-slug', lando, () => {}, undefined, [
				'old.com,new.com',
				'foo,bar',
			] );
			cmd.slug = 'test-slug';
			cmd.siteUrls = [ 'http://test.go-vip.com' ];
			cmd.generateSearchReplaceMap();

			expect( cmd.searchReplaceMap ).toEqual( {
				'test.go-vip.com': 'test-slug.vipdev.lndo.site',
				'old.com': 'new.com',
				foo: 'bar',
			} );
		} );

		it( 'should allow comma in replace value', () => {
			const cmd = new DevEnvSyncSQLCommand( app, env, 'test-slug', lando, () => {}, undefined, [
				'old,new,value',
			] );
			cmd.slug = 'test-slug';
			cmd.siteUrls = [];
			cmd.generateSearchReplaceMap();

			expect( cmd.searchReplaceMap ).toEqual( {
				old: 'new,value',
			} );
		} );

		it( 'should allow empty replace value', () => {
			const cmd = new DevEnvSyncSQLCommand( app, env, 'test-slug', lando, () => {}, undefined, [
				'old,',
			] );
			cmd.slug = 'test-slug';
			cmd.siteUrls = [];
			cmd.generateSearchReplaceMap();

			expect( cmd.searchReplaceMap ).toEqual( {
				old: '',
			} );
		} );

		it( 'should throw error for invalid format', () => {
			const cmd = new DevEnvSyncSQLCommand( app, env, 'test-slug', lando, () => {}, undefined, [
				'invalidpair',
			] );
			cmd.slug = 'test-slug';
			cmd.siteUrls = [];

			expect( () => cmd.generateSearchReplaceMap() ).toThrow( 'Invalid search-replace format' );
		} );

		it( 'should throw error for empty search value', () => {
			const cmd = new DevEnvSyncSQLCommand( app, env, 'test-slug', lando, () => {}, undefined, [
				',replace',
			] );
			cmd.slug = 'test-slug';
			cmd.siteUrls = [];

			expect( () => cmd.generateSearchReplaceMap() ).toThrow( 'Search value cannot be empty' );
		} );
	} );

	describe( '.runSearchReplace', () => {
		it( 'should run search-replace operation on the mysqldump file', async () => {
			const cmd = new DevEnvSyncSQLCommand( app, env, 'test-slug', lando );
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
			const cmd = new DevEnvSyncSQLCommand( app, env, 'test-slug', lando );
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

			const cmd = new DevEnvSyncSQLCommand( app, env, 'test-slug', lando );
			await cmd.runImport();

			expect( mockImport ).toHaveBeenCalled();
		} );
	} );

	describe( '.run', () => {
		const syncCommand = new DevEnvSyncSQLCommand( app, env, 'test-slug', lando );
		const exportSpy = jest.spyOn( syncCommand, 'generateExport' );
		const getSiteUrlsFromSDSSpy = jest.spyOn( syncCommand, 'getSiteUrlsFromSDS' );
		const generateSearchReplaceMapSpy = jest.spyOn( syncCommand, 'generateSearchReplaceMap' );
		const searchReplaceSpy = jest.spyOn( syncCommand, 'runSearchReplace' );
		const importSpy = jest.spyOn( syncCommand, 'runImport' );

		beforeAll( () => {
			fs.copyFileSync(
				path.join( __dirname, '../../__fixtures__/dev-env-e2e/mysqldump-detection.sql.gz' ),
				syncCommand.gzFile
			);
			fs.copyFileSync(
				path.join( __dirname, '../../__fixtures__/dev-env-e2e/mysqldump-detection.sql' ),
				syncCommand.sqlFile
			);
			exportSpy.mockResolvedValue();
			getSiteUrlsFromSDSSpy.mockResolvedValue( [] );
			searchReplaceSpy.mockResolvedValue();
			importSpy.mockResolvedValue();
		} );

		afterAll( () => {
			exportSpy.mockRestore();
			searchReplaceSpy.mockRestore();
			importSpy.mockRestore();
		} );

		it( 'should sequentially run all the steps', async () => {
			await syncCommand.run();

			expect( exportSpy ).toHaveBeenCalled();
			expect( clientFileUploader.unzipFile ).toHaveBeenCalled();
			expect( getSiteUrlsFromSDSSpy ).toHaveBeenCalled();
			expect( generateSearchReplaceMapSpy ).toHaveBeenCalled();
			expect( searchReplaceSpy ).toHaveBeenCalled();
			expect( importSpy ).toHaveBeenCalled();
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
