import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const httpResponse = ( status, body ) => {
	return Promise.resolve( {
		ok: status >= 200 && status < 300,
		status,
		headers: {
			get: name => ( name.toLowerCase() === 'content-type' ? 'application/json' : null ),
		},
		json: () => Promise.resolve( body ),
		text: () => Promise.resolve( JSON.stringify( body ) ),
	} );
};

describe( 'vip app deploy rechallenge smoke', () => {
	let appDeployCmd;
	let http;
	let runRechallenge;
	let exitWithError;

	beforeEach( () => {
		jest.resetModules();

		jest.doMock( '../../src/lib/cli/command', () => {
			const commandMock = {
				argv: () => commandMock,
				examples: () => commandMock,
				option: () => commandMock,
				command: () => commandMock,
			};
			return jest.fn( () => commandMock );
		} );

		jest.doMock( '../../src/lib/client-file-uploader', () => ( {
			getFileMeta: jest.fn().mockResolvedValue( {
				fileName: '/vip/skeleton.zip',
				basename: 'skeleton.zip',
				fileSize: 123,
				isCompressed: true,
			} ),
			uploadImportFileToS3: jest.fn().mockResolvedValue( {
				fileMeta: {
					basename: 'skeleton.zip',
					fileName: '/vip/skeleton.zip',
					fileSize: 123,
					isCompressed: true,
				},
				checksum: 'abc123',
				result: 'ok',
			} ),
		} ) );

		jest.doMock( '../../src/lib/custom-deploy/custom-deploy', () => ( {
			validateFile: jest.fn().mockResolvedValue( true ),
			validateLargeArchiveFiles: jest.fn().mockResolvedValue( true ),
			promptToContinue: jest.fn().mockResolvedValue( true ),
			validateCustomDeployKey: jest.fn().mockResolvedValue( {
				appId: 123,
				envId: 456,
				envType: 'develop',
				envUniqueLabel: 'develop',
				primaryDomainName: 'example.com/develop',
				launched: false,
			} ),
		} ) );

		jest.doMock( '../../src/lib/tracker', () => ( {
			trackEventWithEnv: jest.fn( () => Promise.resolve() ),
		} ) );

		jest.doMock( '../../src/lib/api/http', () => ( {
			__esModule: true,
			default: jest.fn(),
		} ) );

		jest.doMock( '../../src/lib/rechallenge/flow', () => ( {
			runRechallenge: jest.fn(),
			isInteractiveContext: () => false,
			shouldWaitForRechallenge: () => true,
		} ) );

		jest.doMock( '../../src/lib/rechallenge/token-cache', () => ( {
			__esModule: true,
			default: {
				get: jest.fn( () => Promise.resolve( null ) ),
				set: jest.fn( () => Promise.resolve() ),
				clearScope: jest.fn(),
				clearAll: jest.fn(),
			},
		} ) );

		const exitModule = require( '../../src/lib/cli/exit' );
		exitWithError = jest.spyOn( exitModule, 'withError' ).mockImplementation( () => {
			throw new Error( 'exit.withError called' );
		} );

		appDeployCmd = require( '../../src/bin/vip-app-deploy' ).appDeployCmd;
		http = require( '../../src/lib/api/http' ).default;
		runRechallenge = require( '../../src/lib/rechallenge/flow' ).runRechallenge;

		process.env.NODE_ENV = 'test';
		process.env.WPVIP_DEPLOY_TOKEN = 'deploy-token';
		jest.spyOn( console, 'log' ).mockImplementation( () => {} );
		jest.spyOn( console, 'error' ).mockImplementation( () => {} );
	} );

	it( 'retries app deploy mutation with elevated header in API chain', async () => {
		runRechallenge.mockResolvedValueOnce( {
			token: 'manual-elevated-token',
			expiresAt: new Date( Date.now() + 60_000 ).toISOString(),
			purpose: 'validate-elevated-permissions',
		} );

		http
			.mockReturnValueOnce(
				httpResponse( 200, {
					data: null,
					errors: [
						{
							message: 'Missing elevated token',
							extensions: {
								code: 'elevated-permission-required',
								rechallenge: {
									version: 'v2',
									createSessionPath: '/rechallenge/v2/sessions',
									statusPathTemplate: '/rechallenge/v2/sessions/{challengeId}',
									exchangePathTemplate: '/rechallenge/v2/sessions/{challengeId}/exchange',
									elevatedHeaderName: 'x-elevated-token',
								},
							},
						},
					],
				} )
			)
			.mockReturnValueOnce(
				httpResponse( 200, {
					data: {
						startCustomDeploy: {
							success: true,
							message: 'ok',
						},
					},
				} )
			);

		await expect(
			appDeployCmd( [ '/vip/skeleton.zip' ], { app: 1, env: 2, force: true } )
		).resolves.toBeUndefined();

		expect( runRechallenge ).toHaveBeenCalledTimes( 1 );
		expect( http ).toHaveBeenCalledTimes( 2 );
		const secondCallInit = http.mock.calls[ 1 ][ 1 ];
		expect( secondCallInit.headers[ 'x-elevated-token' ] ).toBe( 'manual-elevated-token' );
		expect( secondCallInit.headers.authorization ).toBe( 'Bearer deploy-token' );
		expect( exitWithError ).not.toHaveBeenCalled();
	} );
} );
