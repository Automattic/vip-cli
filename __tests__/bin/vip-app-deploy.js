import { appDeployCmd } from '../../src/bin/vip-app-deploy';
import * as exit from '../../src/lib/cli/exit';
import { uploadImportSqlFileToS3 } from '../../src/lib/client-file-uploader';
import {
	validateFile,
	promptToContinue,
	validateCustomDeployKey,
} from '../../src/lib/custom-deploy/custom-deploy';
import { validateDeployFileExt, validateFilename } from '../../src/lib/validations/custom-deploy';

jest.mock( '../../src/lib/client-file-uploader', () => ( {
	...jest.requireActual( '../../src/lib/client-file-uploader' ),
	getFileMeta: jest
		.fn()
		.mockResolvedValue( { fileName: '/vip/skeleton.zip', basename: 'skeleton.zip' } ),
	uploadImportSqlFileToS3: jest.fn(),
} ) );

jest.mock( '../../src/lib/custom-deploy/custom-deploy', () => ( {
	validateFile: jest.fn(),
	renameFile: jest.fn(),
	promptToContinue: jest.fn().mockResolvedValue( true ),
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

jest.mock( '../../src/lib/cli/command', () => {
	const commandMock = {
		argv: () => commandMock,
		examples: () => commandMock,
		option: () => commandMock,
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
					'Error: The characters used in the name of a file for custom deploys are limited to [0-9,a-z,A-Z,-,_,.]'
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
		it( 'should call expected functions', async () => {
			await appDeployCmd( args, opts );

			expect( validateCustomDeployKey ).toHaveBeenCalledTimes( 1 );

			expect( validateFile ).toHaveBeenCalledTimes( 1 );

			expect( promptToContinue ).not.toHaveBeenCalled();

			expect( uploadImportSqlFileToS3 ).toHaveBeenCalledTimes( 1 );
		} );
	} );
} );
