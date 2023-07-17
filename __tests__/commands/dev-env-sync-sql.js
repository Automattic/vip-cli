/**
 * External dependencies
 */
import { describe, expect, jest } from '@jest/globals';
import fs from 'fs';
import { replace } from '@automattic/vip-search-replace';
import { PassThrough } from 'stream';

/**
 * Internal dependencies
 */
import { DevEnvSyncSQLCommand } from '../../src/commands/dev-env-sync-sql';
import { ExportSQLCommand } from '../../src/commands/export-sql';
import { DevEnvImportSQLCommand } from '../../src/commands/dev-env-import-sql';
import { unzipFile } from '../../src/lib/client-file-uploader';
import { getReadInterface } from '../../src/lib/validations/line-by-line';

/**
 *
 * @param {Array<{name, data}>} eventArgs Event arguments
 * @param {timeout}             timeout
 *
 * @return {Stream} A passthrough stream
 */
function getMockStream( eventArgs, timeout = 10 ) {
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

const mockReadStream = getMockStream( [ { name: 'finish' }, { name: 'data', data: 'data' } ], 10 );
const mockWriteStream = getMockStream( [ { name: 'finish' } ], 20 );

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

replace.mockResolvedValue( mockReadStream );
unzipFile.mockResolvedValue();
getReadInterface.mockReturnValue( getMockStream( [ { name: 'close' } ] ), 100 );

jest.spyOn( console, 'log' ).mockImplementation( () => {} );

describe( 'commands/DevEnvSyncSQLCommand', () => {
	const app = { id: 123, name: 'test-app' };
	const env = { id: 456, name: 'test-env', wpSitesSDS: {} };

	describe( '.generateExport', () => {
		it( 'should create an instance of ExportSQLCommand and run', async () => {
			const mockExport = jest.spyOn( ExportSQLCommand.prototype, 'run' );
			mockExport.mockResolvedValue();

			const cmd = new DevEnvSyncSQLCommand( app, env, 'test-slug' );
			await cmd.generateExport();

			expect( mockExport ).toHaveBeenCalled();
		} );
	} );

	describe( 'generateSearchReplaceMap', () => {
		it( 'should return a map of search-replace values', () => {
			const cmd = new DevEnvSyncSQLCommand( app, env, 'test-slug' );
			cmd.slug = 'test-slug';
			cmd.siteUrls = [ 'test.go-vip.com' ];
			cmd.generateSearchReplaceMap();

			expect( cmd.searchReplaceMap ).toEqual( { 'test.go-vip.com': 'test-slug.vipdev.lndo.site' } );
		} );
	} );

	describe( '.runSearchReplace', () => {
		it( 'should run search-replace operation on the SQL file', async () => {
			const cmd = new DevEnvSyncSQLCommand( app, env, 'test-slug' );
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

			const cmd = new DevEnvSyncSQLCommand( app, env, 'test-slug' );
			await cmd.runImport();

			expect( mockImport ).toHaveBeenCalledWith( true );
		} );
	} );

	describe( '.run', () => {
		const syncCommand = new DevEnvSyncSQLCommand( app, env, 'test-slug' );
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
