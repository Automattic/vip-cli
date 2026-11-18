import { prompt } from 'enquirer';

import { appDeployCmd, parseDeployTargets } from '../../src/bin/vip-app-deploy';
import API from '../../src/lib/api';
import * as exit from '../../src/lib/cli/exit';
import { uploadImportFileToS3 } from '../../src/lib/client-file-uploader';
import {
	validateFile,
	validateLargeArchiveFiles,
	checkCustomDeployKey,
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
	checkCustomDeployKey: jest.fn().mockResolvedValue( {
		info: {
			success: true,
			appId: 123,
			envId: 124,
			envType: 'develop',
			envUniqueLabel: 'develop',
			primaryDomainName: 'example.com/develop',
			launched: false,
		},
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

			expect( checkCustomDeployKey ).toHaveBeenCalledTimes( 1 );

			expect( validateFile ).toHaveBeenCalledTimes( 1 );

			expect( validateLargeArchiveFiles ).toHaveBeenCalledTimes( 1 );

			expect( prompt ).not.toHaveBeenCalled();

			expect( uploadImportFileToS3 ).toHaveBeenCalledTimes( 1 );
			expect( mutate ).toHaveBeenCalledTimes( 1 );
			const { input } = mutate.mock.calls[ 0 ][ 0 ].variables;
			expect( input ).toMatchObject( { id: 123, environmentId: 124 } );
			expect( input ).not.toHaveProperty( 'environmentIds' );
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

	describe( 'parseDeployTargets', () => {
		beforeEach( () => {
			exitSpy.mockReset();
			exitSpy.mockImplementation( message => {
				throw new Error( message );
			} );
		} );

		afterAll( () => {
			exitSpy.mockReset();
		} );

		it( 'falls back to --app/--env when --to is not set', () => {
			expect( parseDeployTargets( { app: 'my-app', env: 'develop' } ) ).toEqual( [
				{ app: 'my-app', env: 'develop' },
			] );
		} );

		it( 'parses repeated, comma-separated, and duplicate targets', () => {
			expect(
				parseDeployTargets( {
					to: [ 'Example-App.production', 'other-app.develop,example-app.production' ],
				} )
			).toEqual( [
				{ app: 'example-app', env: 'production' },
				{ app: 'other-app', env: 'develop' },
			] );
		} );

		it( 'keeps instance suffixes in the environment name', () => {
			expect( parseDeployTargets( { to: 'app.develop.instance-01' } ) ).toEqual( [
				{ app: 'app', env: 'develop.instance-01' },
			] );
		} );

		it.each( [ true, 'example-app', '.develop', 'example-app.', 'app/x.develop', '' ] )(
			'rejects invalid target %p',
			target => {
				expect( () => parseDeployTargets( { to: target } ) ).toThrow( 'Invalid --to value.' );
			}
		);

		it.each( [ { app: 'x' }, { env: 'develop' } ] )( 'rejects --to combined with %p', extra => {
			expect( () => parseDeployTargets( { to: 'a.develop', ...extra } ) ).toThrow(
				'The --to option cannot be used with --app, --env, or an @app.env alias.'
			);
		} );
	} );

	describe( 'appDeployCmd with multiple targets', () => {
		const mutate = jest.fn().mockResolvedValue( {} );
		const envs = {
			'example-app.production': {
				success: true,
				appId: 123,
				envId: 200,
				envType: 'production',
				envUniqueLabel: 'production',
				primaryDomainName: 'example.com',
				launched: true,
			},
			'other-app.develop': {
				success: true,
				appId: 456,
				envId: 300,
				envType: 'develop',
				envUniqueLabel: 'develop',
				primaryDomainName: 'other.example.com',
				launched: false,
			},
		};

		beforeEach( () => {
			jest.clearAllMocks();
			exitSpy.mockReset();
			API.mockReturnValue( { mutate } );
			checkCustomDeployKey.mockImplementation( async ( app, env ) => ( {
				info: envs[ `${ app }.${ env }` ],
			} ) );
			uploadImportFileToS3.mockResolvedValue( {
				fileMeta: { basename: 'skeleton.zip' },
				checksum: 'checksum',
				result: {},
			} );
		} );

		const multiOpts = {
			to: [ 'example-app.production', 'other-app.develop' ],
			skipConfirmation: true,
		};

		it( 'uploads once and starts one deploy with every environment ID', async () => {
			await appDeployCmd( args, multiOpts );

			expect( checkCustomDeployKey ).toHaveBeenCalledTimes( 2 );
			expect( checkCustomDeployKey ).toHaveBeenCalledWith( 'other-app', 'develop' );
			expect( uploadImportFileToS3 ).toHaveBeenCalledTimes( 1 );
			expect( uploadImportFileToS3.mock.calls[ 0 ][ 0 ] ).toMatchObject( {
				app: { id: 123 },
				env: { id: 200 },
			} );
			expect( mutate ).toHaveBeenCalledTimes( 1 );
			const { input } = mutate.mock.calls[ 0 ][ 0 ].variables;
			expect( input ).toMatchObject( { id: 123, environmentIds: [ 200, 300 ] } );
			expect( input ).not.toHaveProperty( 'environmentId' );
		} );

		it( 'deploys an environment addressed twice only once', async () => {
			checkCustomDeployKey.mockResolvedValue( { info: envs[ 'other-app.develop' ] } );
			await appDeployCmd( args, { ...multiOpts, to: [ 'other-app.develop', '456.develop' ] } );

			const { input } = mutate.mock.calls[ 0 ][ 0 ].variables;
			expect( input ).toMatchObject( { id: 456, environmentId: 300 } );
			expect( input ).not.toHaveProperty( 'environmentIds' );
		} );

		it( 'confirms every target before uploading', async () => {
			prompt
				.mockResolvedValueOnce( { confirmedDomain: 'EXAMPLE.COM' } )
				.mockResolvedValueOnce( { confirmedDomain: 'OTHER.EXAMPLE.COM' } );
			await appDeployCmd( args, { ...multiOpts, skipConfirmation: false } );

			expect( prompt ).toHaveBeenCalledTimes( 2 );
			expect( uploadImportFileToS3 ).toHaveBeenCalledTimes( 1 );
		} );

		it( 'checks every environment and summarizes which ones the key was rejected for', async () => {
			checkCustomDeployKey.mockImplementation( async ( app, env ) =>
				app === 'other-app'
					? { error: 'You cannot perform this action in this session' }
					: { info: envs[ `${ app }.${ env }` ] }
			);
			exitSpy.mockImplementationOnce( () => {
				throw new Error( 'exit' );
			} );

			await expect(
				appDeployCmd( args, {
					...multiOpts,
					to: [ 'other-app.develop', 'example-app.production' ],
				} )
			).rejects.toThrow( 'exit' );

			// The failure on the first environment does not stop the second check.
			expect( checkCustomDeployKey ).toHaveBeenCalledTimes( 2 );
			expect( exitSpy ).toHaveBeenCalledWith(
				'The deploy key could not be validated for 1 of 2 environments:\n' +
					'  ✕ other-app.develop: You cannot perform this action in this session\n' +
					'  ✓ example-app.production'
			);
			expect( prompt ).not.toHaveBeenCalled();
			expect( uploadImportFileToS3 ).not.toHaveBeenCalled();
		} );

		it( 'prints the API message as is when the only environment is rejected', async () => {
			checkCustomDeployKey.mockResolvedValueOnce( {
				error: 'You cannot perform this action in this session',
			} );
			exitSpy.mockImplementationOnce( () => {
				throw new Error( 'exit' );
			} );

			await expect(
				appDeployCmd( args, { ...multiOpts, to: 'other-app.develop' } )
			).rejects.toThrow( 'exit' );
			expect( exitSpy ).toHaveBeenCalledWith( 'You cannot perform this action in this session' );
		} );

		it( 'deploys nothing when any confirmation is rejected', async () => {
			prompt
				.mockResolvedValueOnce( { confirmedDomain: 'EXAMPLE.COM' } )
				.mockResolvedValueOnce( { confirmedDomain: 'wrong' } );
			exitSpy.mockImplementationOnce( () => {
				throw new Error( 'deploy aborted' );
			} );
			await expect(
				appDeployCmd( args, { ...multiOpts, skipConfirmation: false } )
			).rejects.toThrow( 'deploy aborted' );

			expect( uploadImportFileToS3 ).not.toHaveBeenCalled();
			expect( mutate ).not.toHaveBeenCalled();
		} );
	} );
} );
