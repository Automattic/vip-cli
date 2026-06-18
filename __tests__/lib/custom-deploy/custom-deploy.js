import * as exit from '../../../src/lib/cli/exit';
import { validateLargeArchiveFiles } from '../../../src/lib/custom-deploy/custom-deploy';
import { trackEventWithEnv } from '../../../src/lib/tracker';
import { findLargeArchiveFilesInDeployArchive } from '../../../src/lib/validations/custom-deploy';

jest.mock( '../../../src/lib/validations/custom-deploy', () => ( {
	...jest.requireActual( '../../../src/lib/validations/custom-deploy' ),
	findLargeArchiveFilesInDeployArchive: jest.fn(),
} ) );

jest.mock( '../../../src/lib/tracker', () => ( {
	trackEventWithEnv: jest.fn().mockResolvedValue( [] ),
} ) );

const exitSpy = jest.spyOn( exit, 'withError' );
jest.spyOn( process, 'exit' ).mockImplementation( () => {} );
jest.spyOn( console, 'error' ).mockImplementation( () => {} );
jest.spyOn( console, 'log' ).mockImplementation( () => {} );

describe( 'custom deploy large archive file validation', () => {
	beforeEach( () => {
		jest.clearAllMocks();
	} );

	it( 'passes when the deploy archive has no large archive files', async () => {
		findLargeArchiveFilesInDeployArchive.mockResolvedValue( [] );

		await validateLargeArchiveFiles( 123, 456, {
			fileName: '/vip/skeleton.zip',
			basename: 'skeleton.zip',
		} );

		expect( exitSpy ).not.toHaveBeenCalled();
		expect( trackEventWithEnv ).not.toHaveBeenCalled();
	} );

	it( 'exits when the deploy archive has archive files over 20 MB', async () => {
		findLargeArchiveFilesInDeployArchive.mockResolvedValue( [
			{
				path: 'mysite/plugins/big-plugin.tar.gz',
				size: 21 * 1024 * 1024,
			},
		] );

		await validateLargeArchiveFiles( 123, 456, {
			fileName: '/vip/skeleton.zip',
			basename: 'skeleton.zip',
		} );

		expect( trackEventWithEnv ).toHaveBeenCalledWith( 123, 456, 'deploy_app_command_error', {
			error_type: 'large-archive-files',
			large_archive_files: [ 'mysite/plugins/big-plugin.tar.gz' ],
		} );
		expect( exitSpy.mock.calls[ 0 ][ 0 ] ).toContain(
			'Deploy archive contains archive file(s) larger than 20.0 MB in the deploy archive'
		);
		expect( exitSpy.mock.calls[ 0 ][ 0 ] ).toContain(
			'mysite/plugins/big-plugin.tar.gz (21.0 MB)'
		);
		expect( exitSpy.mock.calls[ 0 ][ 0 ] ).toContain( '--skip-large-file-verify' );
	} );

	it( 'exits with skip instructions when large file verification fails', async () => {
		findLargeArchiveFilesInDeployArchive.mockRejectedValue( new Error( 'invalid archive' ) );

		await validateLargeArchiveFiles( 123, 456, {
			fileName: '/vip/skeleton.zip',
			basename: 'skeleton.zip',
		} );

		expect( trackEventWithEnv ).toHaveBeenCalledWith( 123, 456, 'deploy_app_command_error', {
			error_type: 'large-archive-file-verify-failed',
			verify_error: 'invalid archive',
		} );
		expect( exitSpy.mock.calls[ 0 ][ 0 ] ).toContain(
			'Unable to verify large archive files in the deploy archive: invalid archive'
		);
		expect( exitSpy.mock.calls[ 0 ][ 0 ] ).toContain( '--skip-large-file-verify' );
	} );
} );
