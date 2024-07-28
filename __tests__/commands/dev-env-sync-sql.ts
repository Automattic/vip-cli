import { replace } from '@automattic/vip-search-replace';
import fs, { ReadStream } from 'fs';
import Lando from 'lando';
import { WriteStream } from 'node:fs';
import { Interface } from 'node:readline';
import { PassThrough } from 'stream';

import { DevEnvImportSQLCommand } from '../../src/commands/dev-env-import-sql';
import { DevEnvSyncSQLCommand } from '../../src/commands/dev-env-sync-sql';
import { ExportSQLCommand } from '../../src/commands/export-sql';
import { unzipFile } from '../../src/lib/client-file-uploader';
import { getReadInterface } from '../../src/lib/validations/line-by-line';

/**
 *
 * @param {Array<{name, data}>} eventArgs Event arguments
 * @param {timeout}             timeout
 *
 * @return {Stream} A passthrough stream
 */
function getMockStream( eventArgs: { name: string; data?: string }[], timeout = 10 ) {
	const mockStream = new PassThrough();

	if ( ! eventArgs ) {
		eventArgs = [ { name: 'finish' } ];
	}

	// Leave 10ms of room for the listeners to setup
	setTimeout( () => {
		eventArgs.forEach( ( { name, data } ) => {
			mockStream.emit( name, data );
		} );
	}, timeout );

	return mockStream;
}

const mockReadStream: ReadStream = getMockStream(
	[ { name: 'finish' }, { name: 'data', data: 'data' } ],
	10
) as unknown as ReadStream;
const mockWriteStream: WriteStream = getMockStream(
	[ { name: 'finish' } ],
	20
) as unknown as WriteStream;

jest.spyOn( fs, 'createReadStream' ).mockReturnValue( mockReadStream );
jest.spyOn( fs, 'createWriteStream' ).mockReturnValue( mockWriteStream );
jest.spyOn( fs, 'renameSync' ).mockImplementation( () => {} );
jest.mock( '@automattic/vip-search-replace', () => {
	return {
		replace: jest.fn(),
	};
} );
jest.mock( '../../src/lib/client-file-uploader', () => {
	return {
		unzipFile: jest.fn(),
	};
} );

jest.mock( '../../src/lib/validations/line-by-line', () => {
	return {
		getReadInterface: jest.fn(),
	};
} );

jest.mocked( replace ).mockResolvedValue( mockReadStream );
jest.mocked( unzipFile ).mockResolvedValue();
jest
	.mocked( getReadInterface )
	.mockResolvedValue( getMockStream( [ { name: 'close' } ], 100 ) as unknown as Interface );

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
					blogId: 2,
					homeUrl: 'https://subsite.com',
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
			cmd.siteUrls = [ 'test.go-vip.com' ];
			cmd.generateSearchReplaceMap();

			expect( cmd.searchReplaceMap ).toEqual( { 'test.go-vip.com': 'test-slug.vipdev.lndo.site' } );
		} );

		it( 'should return a map of search-replace values for multisite', () => {
			const cmd = new DevEnvSyncSQLCommand( app, msEnv, 'test-slug', lando );
			cmd.slug = 'test-slug';
			cmd.siteUrls = [ 'test.go-vip.com', 'subsite.com' ];
			cmd.generateSearchReplaceMap();

			expect( cmd.searchReplaceMap ).toEqual( {
				'test.go-vip.com': 'test-slug.vipdev.lndo.site',
				'subsite.com': 'subsite-com-2.test-slug.vipdev.lndo.site',
			} );
		} );
	} );

	describe( '.runSearchReplace', () => {
		it( 'should run search-replace operation on the SQL file', async () => {
			const cmd = new DevEnvSyncSQLCommand( app, env, 'test-slug', lando );
			cmd.searchReplaceMap = { 'test.go-vip.com': 'test-slug.vipdev.lndo.site' };
			cmd.slug = 'test-slug';

			await cmd.runSearchReplace();
			expect( replace ).toHaveBeenCalledWith( mockReadStream, [
				'test.go-vip.com',
				'test-slug.vipdev.lndo.site',
			] );
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
		const generateSearchReplaceMapSpy = jest.spyOn( syncCommand, 'generateSearchReplaceMap' );
		const searchReplaceSpy = jest.spyOn( syncCommand, 'runSearchReplace' );
		const importSpy = jest.spyOn( syncCommand, 'runImport' );

		beforeAll( () => {
			exportSpy.mockResolvedValue();
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
			expect( unzipFile ).toHaveBeenCalled();
			expect( generateSearchReplaceMapSpy ).toHaveBeenCalled();
			expect( searchReplaceSpy ).toHaveBeenCalled();
			expect( importSpy ).toHaveBeenCalled();
		} );
	} );
} );
