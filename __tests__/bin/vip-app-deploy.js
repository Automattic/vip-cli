import { prompt } from 'enquirer';

import { appDeployCmd } from '../../src/bin/vip-app-deploy';
import API from '../../src/lib/api';
import * as exit from '../../src/lib/cli/exit';
import { uploadImportFileToS3 } from '../../src/lib/client-file-uploader';
import {
	validateFile,
	validateLargeArchiveFiles,
	validateCustomDeployKey,
} from '../../src/lib/custom-deploy/custom-deploy';
import { validateDeployFileExt, validateFilename } from '../../src/lib/validations/custom-deploy';

jest.mock( '../../src/lib/client-file-uploader', () => ( {
	...jest.requireActual( '../../src/lib/client-file-uploader' ),
	getFileMeta: jest.fn().mockImplementation( async () => ( {
		fileName: '/vip/skeleton.zip',
		basename: 'skeleton.zip',
	} ) ),
	uploadImportFileToS3: jest.fn(),
} ) );

jest.mock( '../../src/lib/custom-deploy/custom-deploy', () => ( {
	validateFile: jest.fn(),
	validateLargeArchiveFiles: jest.fn(),
	renameFile: jest.fn(),
	validateCustomDeployKey: jest.fn().mockResolvedValue( {
		success: true,
		appId: 123,
		envId: 124,
		envType: 'develop',
		envUniqueLabel: 'develop',
		primaryDomainName: 'example.com/develop',
		launched: false,
	} ),
} ) );

jest.mock( 'enquirer', () => ( { prompt: jest.fn() } ) );
jest.mock( '../../src/lib/api', () => ( { __esModule: true, default: jest.fn() } ) );
jest.mock( '../../src/lib/tracker', () => ( {
	trackEventWithEnv: jest.fn().mockResolvedValue( [] ),
} ) );

jest.mock( '../../src/lib/cli/command', () => {
	const commandMock = {
		argv: () => commandMock,
		examples: () => commandMock,
		option: () => commandMock,
		command: () => commandMock,
	};
	return jest.fn( () => commandMock );
} );

const exitSpy = jest.spyOn( exit, 'withError' );
jest.spyOn( process, 'exit' ).mockImplementation( () => {} );
jest.spyOn( console, 'error' ).mockImplementation( () => {} );

const args = [ '/vip/skeleton.zip' ];
const opts = {
	app: {
		id: 1,
		organization: {
			id: 2,
		},
	},
	env: {
		id: 3,
		type: 'develop',
	},
	force: true,
};

describe( 'vip-app-deploy', () => {
	describe( 'validations', () => {
		beforeEach( async () => {
			exitSpy.mockClear();
		} );

		it.each( [ '$t2.tar.gz', 'vip-go!!skeleton.zip', '1-(vip).tgz' ] )(
			'fails if the deploy file has has invalid characters',
			async basename => {
				validateFilename( basename );
				expect( exitSpy ).toHaveBeenCalledWith(
					`Filename ${ basename } contains disallowed characters: [0-9,a-z,A-Z,-,_,.]`
				);
			}
		);

		it.each( [ 'test-repo.rar', 'vip-go-skeleton.sql', 'vip.test' ] )(
			'fails if the deploy file has an invalid extension',
			async basename => {
				validateDeployFileExt( basename );
				expect( exitSpy ).toHaveBeenCalledWith(
					'Invalid file extension. Please provide a .zip, .tar.gz, or a .tgz file.'
				);
			}
		);

		it.each( [ 'test-repo.tar.gz', 'vip-go-skeleton.zip', 'vip.tgz' ] )(
			'passes if the deploy file has a valid extension',
			async basename => {
				validateDeployFileExt( basename );
				expect( exitSpy ).not.toHaveBeenCalled();
			}
		);
	} );

	describe( 'appDeployCmd', () => {
		const mutate = jest.fn().mockResolvedValue( {} );

		beforeEach( () => {
			jest.clearAllMocks();
			API.mockReturnValue( { mutate } );
			uploadImportFileToS3.mockResolvedValue( {
				fileMeta: { basename: 'skeleton.zip' },
				checksum: 'checksum',
				result: {},
			} );
		} );

		it( 'should call expected functions', async () => {
			await appDeployCmd( args, opts );

			expect( validateCustomDeployKey ).toHaveBeenCalledTimes( 1 );

			expect( validateFile ).toHaveBeenCalledTimes( 1 );

			expect( validateLargeArchiveFiles ).toHaveBeenCalledTimes( 1 );

			expect( prompt ).not.toHaveBeenCalled();

			expect( uploadImportFileToS3 ).toHaveBeenCalledTimes( 1 );
			expect( mutate ).toHaveBeenCalledTimes( 1 );
		} );

		it( 'skips large file verification when requested', async () => {
			await appDeployCmd( args, { ...opts, skipLargeFileValidation: true } );

			expect( validateFile ).toHaveBeenCalledTimes( 1 );
			expect( validateLargeArchiveFiles ).not.toHaveBeenCalled();
		} );

		it( 'uploads and deploys after matching domain confirmation', async () => {
			prompt.mockResolvedValueOnce( { confirmedDomain: 'EXAMPLE.COM/DEVELOP' } );
			await appDeployCmd( args, { ...opts, force: false } );
			expect( prompt ).toHaveBeenCalledTimes( 1 );
			expect( exitSpy ).not.toHaveBeenCalled();
			expect( uploadImportFileToS3 ).toHaveBeenCalledTimes( 1 );
			expect( mutate ).toHaveBeenCalledTimes( 1 );
		} );

		it.each( [ '', 'other.example.com' ] )(
			'aborts for rejected confirmation %s',
			async confirmedDomain => {
				prompt.mockResolvedValueOnce( { confirmedDomain } );
				exitSpy.mockImplementationOnce( () => {
					throw new Error( 'deploy aborted' );
				} );
				await expect( appDeployCmd( args, { ...opts, force: false } ) ).rejects.toThrow(
					'deploy aborted'
				);
				expect( exitSpy ).toHaveBeenCalledWith(
					'The input did not match the expected environment label. Deploy aborted.'
				);
				expect( uploadImportFileToS3 ).not.toHaveBeenCalled();
				expect( mutate ).not.toHaveBeenCalled();
			}
		);

		it( 'does not upload or deploy when confirmation is cancelled', async () => {
			prompt.mockRejectedValueOnce( new Error( 'cancelled' ) );
			await expect( appDeployCmd( args, { ...opts, force: false } ) ).rejects.toThrow(
				'cancelled'
			);
			expect( uploadImportFileToS3 ).not.toHaveBeenCalled();
			expect( mutate ).not.toHaveBeenCalled();
		} );

		it( 'bypasses confirmation when skipConfirmation is set', async () => {
			await appDeployCmd( args, { ...opts, force: false, skipConfirmation: true } );
			expect( prompt ).not.toHaveBeenCalled();
			expect( uploadImportFileToS3 ).toHaveBeenCalledTimes( 1 );
			expect( mutate ).toHaveBeenCalledTimes( 1 );
		} );
	} );
} );
