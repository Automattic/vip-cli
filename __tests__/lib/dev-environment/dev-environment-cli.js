/* eslint-disable jest/no-conditional-expect */
// @format

/**
 * External dependencies
 */
import chalk from 'chalk';
import { prompt, selectRunMock, confirmRunMock } from 'enquirer';
import nock from 'nock';
import os from 'os';

/**
 * Internal dependencies
 */
import {
	getEnvironmentName,
	getEnvironmentStartCommand,
	processComponentOptionInput,
	promptForText,
	promptForComponent,
	promptForArguments,
	setIsTTY,
	processVersionOption,
	resolvePhpVersion,
} from '../../../src/lib/dev-environment/dev-environment-cli';
import * as devEnvCore from '../../../src/lib/dev-environment/dev-environment-core';
import * as devEnvConfiguration from '../../../src/lib/dev-environment/dev-environment-configuration-file';
import { DEV_ENVIRONMENT_PHP_VERSIONS } from '../../../src/lib/constants/dev-environment';

jest.spyOn( console, 'log' ).mockImplementation( () => {} );

jest.mock( 'enquirer', () => {
	const _selectRunMock = jest.fn();
	const SelectClass = class {};
	SelectClass.prototype.run = _selectRunMock;

	const _confirmRunMock = jest.fn();
	const ConfirmClass = class {};
	ConfirmClass.prototype.run = _confirmRunMock;
	return {
		prompt: jest.fn(),
		Select: SelectClass,
		selectRunMock: _selectRunMock,

		Confirm: ConfirmClass,
		confirmRunMock: _confirmRunMock,
	};
} );

const testReleaseWP = '5.9';

const scope = nock( 'https://raw.githubusercontent.com' )
	.get( '/Automattic/vip-container-images/master/wordpress/versions.json' )
	.reply( 200, [
		{
			ref: '3ae9f9ffe311e546b0fd5f82d456b3539e3b8e74',
			tag: '5.9.1',
			cacheable: true,
			locked: false,
			prerelease: true,
		},
		{
			ref: '5.9',
			tag: '5.9',
			cacheable: true,
			locked: false,
			prerelease: false,
		},
	] );
scope.persist( true );

jest.mock( '../../../src/lib/constants/dev-environment', () => {
	const devEnvironmentConstants = jest.requireActual(
		'../../../src/lib/constants/dev-environment'
	);

	return {
		...devEnvironmentConstants,
		// Use separate version file to avoid overwriting actual cached images with mocked values
		DEV_ENVIRONMENT_WORDPRESS_CACHE_KEY: 'test-wordpress-versions.json',
	};
} );

describe( 'lib/dev-environment/dev-environment-cli', () => {
	beforeAll( () => {
		setIsTTY( true );
	} );
	beforeEach( () => {
		prompt.mockReset();
		confirmRunMock.mockReset();
	} );
	describe( 'getEnvironmentName with no environments present', () => {
		beforeEach( () => {
			const getAllEnvironmentNamesMock = jest.spyOn( devEnvCore, 'getAllEnvironmentNames' );
			getAllEnvironmentNamesMock.mockReturnValue( [] );
		} );

		it.each( [
			{
				// default value
				options: {},
				expected: 'vip-local',
			},
			{
				// use custom name
				options: {
					slug: 'foo',
				},
				expected: 'foo',
			},
			{
				// When app.env is not allowed use default value
				options: {
					allowAppEnv: false,
					app: '123',
					env: 'bar.car',
					slug: 'foo',
				},
				expected: 'foo',
			},
			{
				// construct name from app and env
				options: {
					allowAppEnv: true,
					app: '123',
					env: 'bar.car',
				},
				expected: '123-bar.car',
			},
			{
				// custom name takes precedence
				options: {
					allowAppEnv: true,
					slug: 'foo',
					app: '123',
					env: 'bar.car',
				},
				expected: 'foo',
			},
		] )( 'should get correct name', input =>
			expect( getEnvironmentName( input.options ) ).resolves.toStrictEqual( input.expected )
		);
		it( 'should throw an exception if used the app.env when not allowed', () => {
			const options = {
				allowAppEnv: false,
				app: '123',
				env: 'bar',
			};

			const expectedErrorMessage =
				"This command does not support @app.env notation. Use '--slug=123-bar' to target the local environment.";
			return expect( getEnvironmentName( options ) ).rejects.toThrow( expectedErrorMessage );
		} );
	} );
	describe( 'getEnvironmentName with 1 environment present', () => {
		beforeEach( () => {
			const getAllEnvironmentNamesMock = jest.spyOn( devEnvCore, 'getAllEnvironmentNames' );
			getAllEnvironmentNamesMock.mockReturnValue( [ 'single-site' ] );
		} );

		it( 'should return first environment found if only one present', () =>
			expect( getEnvironmentName( {} ) ).resolves.toStrictEqual( 'single-site' ) );
	} );
	describe( 'getEnvironmentName with multiple environments present', () => {
		beforeEach( () => {
			const getAllEnvironmentNamesMock = jest.spyOn( devEnvCore, 'getAllEnvironmentNames' );
			getAllEnvironmentNamesMock.mockReturnValue( [ 'single-site', 'ms-site' ] );
		} );

		it( 'should throw an error', () => {
			const options = {};

			const errorMsg = `More than one environment found: ${ chalk.blue.bold(
				'single-site, ms-site'
			) }. Please re-run command with the --slug parameter for the targeted environment.`;
			return expect( getEnvironmentName( options ) ).rejects.toThrow( errorMsg );
		} );
	} );
	describe( 'getEnvironmentName with configuration file present', () => {
		beforeEach( () => {
			const getConfigurationFileOptionsMock = jest.spyOn(
				devEnvConfiguration,
				'getConfigurationFileOptions'
			);
			getConfigurationFileOptionsMock.mockReturnValue( {
				slug: 'config-file-slug',
			} );
		} );

		it( 'should return configuration file environment', () =>
			expect( getEnvironmentName( {} ) ).resolves.toStrictEqual( 'config-file-slug' ) );

		it( 'should override configuration file environment with option slug', () => {
			const resultPromise = getEnvironmentName( {
				slug: 'foo',
			} );

			return expect( resultPromise ).resolves.toStrictEqual( 'foo' );
		} );

		it( 'should override configuration file environment with app slug', () => {
			const resultPromise = getEnvironmentName( {
				allowAppEnv: true,
				app: '123',
				env: 'bar.car',
			} );

			return expect( resultPromise ).resolves.toStrictEqual( '123-bar.car' );
		} );
	} );
	describe( 'getEnvironmentStartCommand', () => {
		it.each( [
			{
				// default value
				slug: undefined,
				configurationFileOptions: {},
				expected: 'vip dev-env start',
			},
			{
				// use custom name
				slug: 'foo',
				configurationFileOptions: {},
				expected: 'vip dev-env start --slug foo',
			},
			{
				// custom name takes precedence
				slug: '',
				configurationFileOptions: {},
				expected: 'vip dev-env start',
			},
			{
				// use configuration file
				slug: undefined,
				configurationFileOptions: { slug: 'config-file-slug' },
				expected: 'vip dev-env start',
			},
			{
				// use slug with configuration file (slug overrides)
				slug: 'foo',
				configurationFileOptions: { slug: 'config-file-slug' },
				expected: 'vip dev-env start --slug foo',
			},
		] )( 'should get correct start command', input => {
			const result = getEnvironmentStartCommand( input.slug, input.configurationFileOptions );

			expect( result ).toStrictEqual( input.expected );
		} );
	} );
	describe( 'processComponentOptionInput', () => {
		const cases = [
			{
				// base tag
				param: testReleaseWP,
				allowLocal: true,
				expected: {
					mode: 'image',
					tag: testReleaseWP,
				},
			},
			{
				// if local is not allowed
				param: '/tmp/wp',
				allowLocal: false,
				expected: {
					mode: 'image',
					tag: '/tmp/wp',
				},
			},
			{
				param: '~/path',
				allowLocal: true,
				expected: {
					mode: 'local',
					dir: '~/path',
				},
			},
		];

		if ( os.platform() === 'win32' ) {
			cases.push(
				{
					param: 'C:\\path',
					allowLocal: true,
					expected: {
						mode: 'local',
						dir: 'C:\\path',
					},
				},
				{
					param: 'C:/path',
					allowLocal: true,
					expected: {
						mode: 'local',
						dir: 'C:/path',
					},
				}
			);
		}
		it.each( cases )( 'should process options and use defaults', input => {
			const result = processComponentOptionInput( input.param, input.allowLocal );

			expect( result ).toStrictEqual( input.expected );
		} );
	} );
	describe( 'promptForText', () => {
		it( 'should trim provided value', () => {
			const providedValue = '  bar  ';

			prompt.mockResolvedValue( { input: providedValue } );

			const resultPromise = promptForText( 'Give me something', 'foo' );

			return expect( resultPromise ).resolves.toStrictEqual( 'bar' );
		} );
	} );
	describe( 'promptForComponent', () => {
		beforeEach( () => {
			selectRunMock.mockReset();
		} );

		it.each( [
			{
				// mu plugins local
				component: 'muPlugins',
				mode: 'local',
				path: '/tmp',
				expected: {
					mode: 'local',
					dir: '/tmp',
				},
			},
			{
				// muPlugins hav just one tag - auto
				component: 'muPlugins',
				mode: 'image',
				expected: {
					mode: 'image',
				},
			},
			{
				// appCode have just one tag
				component: 'appCode',
				mode: 'image',
				expected: {
					mode: 'image',
				},
			},
		] )( 'should return correct component %p', async input => {
			prompt.mockResolvedValue( { input: input.path } );
			selectRunMock.mockResolvedValueOnce( input.mode ).mockResolvedValueOnce( input.path );

			const result = await promptForComponent( input.component, true );

			expect( result ).toStrictEqual( input.expected );
		} );

		it.each( [
			{
				tag: testReleaseWP,
				expected: {
					mode: 'image',
					tag: testReleaseWP,
				},
			},
		] )( 'should return correct component for wordpress %p', async input => {
			selectRunMock.mockResolvedValueOnce( input.tag );

			const result = await promptForComponent( 'wordpress', false );

			expect( result ).toStrictEqual( input.expected );
		} );
	} );
	describe( 'promptForArguments', () => {
		it.each( [
			{
				preselected: {
					title: 'a',
					muPlugins: 'mu',
					appCode: 'code',
					wordpress: 'wp',
				},
				default: {},
			},
			{
				preselected: {
					muPlugins: 'mu',
					appCode: 'code',
					wordpress: 'wp',
				},
				default: {
					title: 'b',
				},
			},
		] )( 'should handle title', async input => {
			prompt.mockResolvedValue( { input: input.default.title } );
			selectRunMock.mockResolvedValue( '' );

			const result = await promptForArguments( input.preselected, input.default );

			if ( input.preselected.title ) {
				expect( prompt ).toHaveBeenCalledTimes( 1 );
			} else {
				expect( prompt ).toHaveBeenCalledTimes( 2 );

				const calledWith = prompt.mock.calls[ 0 ][ 0 ];
				expect( prompt ).toHaveBeenCalledWith( {
					...calledWith,
					initial: input.default.title,
				} );
			}

			const expectedValue = input.preselected.title ? input.preselected.title : input.default.title;

			expect( result.wpTitle ).toStrictEqual( expectedValue );
		} );
		it.each( [
			{
				preselected: {
					title: 'a',
					wordpress: testReleaseWP,
					multisite: 'subdomain',
				},
				default: {},
			},
			{
				preselected: {
					title: 'a',
					wordpress: testReleaseWP,
					multisite: false,
				},
				default: {},
			},
			{
				preselected: {
					title: 'a',
					wordpress: testReleaseWP,
				},
				default: {
					multisite: false,
				},
			},
			{
				preselected: {
					title: 'a',
					wordpress: testReleaseWP,
				},
				default: {
					multisite: 'subdirectory',
				},
			},
			{
				preselected: {
					title: 'a',
					wordpress: testReleaseWP,
				},
				default: {
					multisite: true,
				},
			},
		] )( 'should handle multisite', async input => {
			confirmRunMock.mockResolvedValue( input.default.multisite );
			selectRunMock.mockResolvedValue( '' );

			const result = await promptForArguments( input.preselected, input.default );

			if ( 'multisite' in input.preselected ) {
				expect( prompt ).toHaveBeenCalledTimes( 0 );
			} else {
				expect( prompt ).toHaveBeenCalledTimes( 1 );
				expect( confirmRunMock ).toHaveBeenCalledTimes( 5 );
			}

			const expectedValue =
				'multisite' in input.preselected ? input.preselected.multisite : input.default.multisite;

			expect( result.multisite ).toStrictEqual( expectedValue );
		} );
		it.each( [
			{
				preselected: {
					title: 'a',
					multisite: true,
					mediaRedirectDomain: 'a',
					wordpress: testReleaseWP,
				},
				default: {
					mediaRedirectDomain: 'b',
				},
			},
			{
				preselected: {
					title: 'a',
					multisite: true,
					wordpress: testReleaseWP,
				},
				default: {
					mediaRedirectDomain: 'b',
				},
			},
		] )( 'should handle media redirect query', async input => {
			confirmRunMock.mockResolvedValue( input.default.mediaRedirectDomain );
			selectRunMock.mockResolvedValue( '' );

			const result = await promptForArguments( input.preselected, input.default );

			if ( input.preselected.mediaRedirectDomain ) {
				expect( confirmRunMock ).toHaveBeenCalledTimes( 5 );
			} else {
				expect( confirmRunMock ).toHaveBeenCalledTimes( 6 );
			}

			const expectedValue = input.preselected.mediaRedirectDomain
				? input.preselected.mediaRedirectDomain
				: input.default.mediaRedirectDomain;

			expect( result.mediaRedirectDomain ).toStrictEqual( expectedValue );
		} );

		it.each( [
			{
				preselected: {
					title: 'a',
					wordpress: testReleaseWP,
					mariadb: 'maria_a',
				},
				default: {},
			},
			{
				preselected: {
					title: 'a',
					wordpress: testReleaseWP,
				},
				default: {
					mariadb: 'maria_b',
				},
			},
		] )( 'should handle mariadb', async input => {
			selectRunMock.mockResolvedValue( '' );

			const result = await promptForArguments( input.preselected, input.default );

			const expectedMaria = input.preselected.mariadb
				? input.preselected.mariadb
				: input.default.mariadb;

			expect( result.mariadb ).toStrictEqual( expectedMaria );
		} );
	} );
	describe( 'processVersionOption', () => {
		it.each( [
			{
				preselected: {
					wp: 'trunk',
				},
				expected: {
					wp: 'trunk',
				},
			},
			{
				preselected: {
					wp: '6',
				},
				expected: {
					wp: '6.0',
				},
			},
			{
				preselected: {
					wp: '6.1',
				},
				expected: {
					wp: '6.1',
				},
			},
		] )( 'should process versions correctly', async input => {
			const version = processVersionOption( input.preselected.wp );

			expect( version ).toStrictEqual( input.expected.wp );
		} );
	} );

	describe( 'resolvePhpVersion', () => {
		it.each( [
			[ '7.4', DEV_ENVIRONMENT_PHP_VERSIONS[ '7.4' ] ],
			[ '8.0', DEV_ENVIRONMENT_PHP_VERSIONS[ '8.0' ] ],
			[ '8.1', DEV_ENVIRONMENT_PHP_VERSIONS[ '8.1' ] ],
			[ '8.2', DEV_ENVIRONMENT_PHP_VERSIONS[ '8.2' ] ],
			[ 'image:php:8.0', 'image:php:8.0' ],
			[
				'ghcr.io/automattic/vip-container-images/php-fpm-ubuntu:8.0',
				'ghcr.io/automattic/vip-container-images/php-fpm-ubuntu:8.0',
			],
		] )( 'should process versions correctly', async ( input, expected ) => {
			const actual = resolvePhpVersion( input );
			expect( actual ).toStrictEqual( expected );
		} );
	} );
} );
