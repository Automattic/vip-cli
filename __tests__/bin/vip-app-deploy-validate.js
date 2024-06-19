import { appDeployValidateCmd } from '../../src/bin/vip-app-deploy-validate';
import * as exit from '../../src/lib/cli/exit';
import { getFileMeta } from '../../src/lib/client-file-uploader';
import { validateFile } from '../../src/lib/custom-deploy/custom-deploy';
import {
	validateName,
	validateZipFile,
	validateTarFile,
} from '../../src/lib/validations/custom-deploy';

jest.mock( '../../src/lib/client-file-uploader', () => ( {
	...jest.requireActual( '../../src/lib/client-file-uploader' ),
	getFileMeta: jest
		.fn()
		.mockResolvedValue( { fileName: '/vip/skeleton.zip', basename: 'skeleton.zip' } ),
} ) );

jest.mock( '../../src/lib/custom-deploy/custom-deploy', () => ( {
	validateFile: jest.fn(),
} ) );

jest.mock( '../../src/lib/validations/custom-deploy', () => {
	return {
		...jest.requireActual( '../../src/lib/validations/custom-deploy' ),
		validateZipFile: jest.fn(),
		validateTarFile: jest.fn(),
	};
} );

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

describe( 'vip-app-deploy-validate', () => {
	describe( 'validateName', () => {
		beforeEach( async () => {
			exitSpy.mockClear();
		} );

		it.each( [ '!client-mu-plugins', '..vip-go-skeleton', '*test' ] )(
			'fails if the file has has invalid characters for directories',
			basename => {
				validateName( basename, true );
				expect( exitSpy ).toHaveBeenCalledWith(
					`Filename ${ basename } contains disallowed characters: [!:*?"<>|'/^..]+`
				);
			}
		);

		it.each( [ 'client-mu-plugins', 'vip-go-skeleton/', '._vip-go-skeleton' ] )(
			'passes if the file has has valid characters for directories',
			basename => {
				validateName( basename, true );
				expect( exitSpy ).not.toHaveBeenCalled();
			}
		);

		it.each( [ 'client-mu-/plugins.php', 'vip-?config.php' ] )(
			'fails if the file has has invalid characters for non-directories',
			basename => {
				validateName( basename, false );
				expect( exitSpy ).toHaveBeenCalledWith(
					`Filename ${ basename } contains disallowed characters: [!/:*?"<>|'/^..]+`
				);
			}
		);

		it.each( [ 'client-mu-plugins.php', 'vip-config.php' ] )(
			'passes if the file has has valid characters for non-directories',
			basename => {
				validateName( basename, false );
				expect( exitSpy ).not.toHaveBeenCalled();
			}
		);
	} );

	describe( 'appDeployValidateCmd', () => {
		beforeEach( () => {
			jest.clearAllMocks();
		} );

		it( 'should call expected functions (zip)', async () => {
			const args = [ '/vip/skeleton.zip' ];
			getFileMeta.mockResolvedValue( { fileName: '/vip/skeleton.zip', basename: 'skeleton.zip' } );

			await appDeployValidateCmd( args, opts );
			expect( validateFile ).toHaveBeenCalledTimes( 1 );
			expect( validateZipFile ).toHaveBeenCalledTimes( 1 );
		} );

		it( 'should call expected functions (tar)', async () => {
			const args = [ '/vip/foo.tar.gz' ];
			getFileMeta.mockResolvedValue( {
				fileName: '/vip/foo.tar.gz',
				basename: 'foo.tar.gz',
			} );

			await appDeployValidateCmd( args, opts );
			expect( validateFile ).toHaveBeenCalledTimes( 1 );
			expect( validateTarFile ).toHaveBeenCalledTimes( 1 );
		} );
	} );
} );
