/**
 * @format
 */

/**
 * External dependencies
 */
import { prompt, selectRunMock, confirmRunMock } from 'enquirer';
import nock from 'nock';

/**
 * Internal dependencies
 */

import { getEnvironmentName, getEnvironmentStartCommand, processComponentOptionInput, promptForText, promptForComponent } from 'lib/dev-environment/dev-environment-cli';
import { promptForArguments } from '../../../src/lib/dev-environment/dev-environment-cli';

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

const testReleaseTag = '5.9';
const testReleaseRef = '5.9.2';

const scope = nock( 'https://raw.githubusercontent.com' )
	.get( '/Automattic/vip-container-images/master/wordpress/versions.json' )
	.reply( 200, [ {
		ref: '3ae9f9ffe311e546b0fd5f82d456b3539e3b8e74',
		tag: '5.9.1',
		cacheable: true,
		locked: false,
		prerelease: true,
	}, {
		ref: '5.9',
		tag: '5.9',
		cacheable: true,
		locked: false,
		prerelease: false,
	} ] );
scope.persist( true );

describe( 'lib/dev-environment/dev-environment-cli', () => {
	beforeEach( () => {
		prompt.mockReset();
		confirmRunMock.mockReset();
	} );
	describe( 'getEnvironmentName', () => {
		it.each( [
			{ // default value
				options: {},
				expected: 'vip-local',
			},
			{ // use custom name
				options: {
					slug: 'foo',
				},
				expected: 'foo',
			},
			{ // construct name from app and env
				options: {
					app: '123',
					env: 'bar.car',
				},
				expected: '123-bar.car',
			},
			{ // custom name takes precedence
				options: {
					slug: 'foo',
					app: '123',
					env: 'bar.car',
				},
				expected: 'foo',
			},
		] )( 'should get correct name', async input => {
			const result = getEnvironmentName( input.options );

			expect( result ).toStrictEqual( input.expected );
		} );
	} );
	describe( 'getEnvironmentStartCommand', () => {
		it.each( [
			{ // default value
				options: {},
				expected: 'vip dev-env start',
			},
			{ // use custom name
				options: {
					slug: 'foo',
				},
				expected: 'vip dev-env start --slug foo',
			},
			{ // construct name from app and env
				options: {
					app: '123',
					env: 'bar.car',
				},
				expected: 'vip @123.bar.car dev-env start',
			},
			{ // custom name takes precedence
				options: {
					slug: 'foo',
					app: '123',
					env: 'bar.car',
				},
				expected: 'vip dev-env start --slug foo',
			},
		] )( 'should get correct start command', async input => {
			const result = getEnvironmentStartCommand( input.options );

			expect( result ).toStrictEqual( input.expected );
		} );
	} );
	describe( 'processComponentOptionInput', () => {
		it.each( [
			{ // base tag
				param: testReleaseTag,
				allowLocal: true,
				expected: {
					mode: 'image',
					tag: testReleaseTag,
					ref: testReleaseRef,
				},
			},
			{ // if local is not allowed
				param: '/tmp/wp',
				allowLocal: false,
				expected: {
					mode: 'image',
					tag: '/tmp/wp',
				},
			},
			{ // if local is  allowed
				param: '~/path',
				allowLocal: true,
				expected: {
					mode: 'local',
					dir: '~/path',
				},
			},
		] )( 'should process options and use defaults', async input => {
			const result = processComponentOptionInput( input.param, input.allowLocal );

			expect( result ).toStrictEqual( input.expected );
		} );
	} );
	describe( 'promptForText', () => {
		it( 'should trim provided value', async () => {
			const providedValue = '  bar  ';

			prompt.mockResolvedValue( { input: providedValue } );

			const result = await promptForText( 'Give me something', 'foo' );

			expect( result ).toStrictEqual( 'bar' );
		} );
	} );
	describe( 'promptForComponent', () => {
		beforeEach( () => {
			selectRunMock.mockReset();
		} );

		it.each( [
			{ // mu plugins local
				component: 'muPlugins',
				mode: 'local',
				path: '/tmp',
				expected: {
					mode: 'local',
					dir: '/tmp',
				},
			},
			{ // muPlugins hav just one tag - auto
				component: 'muPlugins',
				mode: 'image',
				expected: {
					mode: 'image',
				},
			},
			{ // clientCode have just one tag
				component: 'clientCode',
				mode: 'image',
				expected: {
					mode: 'image',
				},
			},
		] )( 'should return correct component %p', async input => {
			prompt.mockResolvedValue( { input: input.path } );
			selectRunMock
				.mockResolvedValueOnce( input.mode )
				.mockResolvedValueOnce( input.path );

			const result = await promptForComponent( input.component, true );

			expect( result ).toStrictEqual( input.expected );
		} );

		it.each( [
			{
				tag: testReleaseTag,
				expected: {
					mode: 'image',
					tag: testReleaseTag,
				},
			},
		] )( 'should return correct component for wordpress %p', async input => {
			selectRunMock
				.mockResolvedValueOnce( input.tag );

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
					clientCode: 'code',
					wordpress: 'wp',
				},
				default: {
				},
			},
			{
				preselected: {
					muPlugins: 'mu',
					clientCode: 'code',
					wordpress: 'wp',
				},
				default: {
					title: 'b',
				},
			},
		] )( 'should handle title', async input => {
			prompt.mockResolvedValue( { input: input.default.title } );

			const result = await promptForArguments( input.preselected, input.default );

			if ( input.preselected.title ) {
				expect( prompt ).toHaveBeenCalledTimes( 0 );
			} else {
				expect( prompt ).toHaveBeenCalledTimes( 1 );

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
					wordpress: testReleaseTag,
					multisite: true,
				},
				default: {
				},
			},
			{
				preselected: {
					title: 'a',
					wordpress: testReleaseTag,
					multisite: false,
				},
				default: {
				},
			},
			{
				preselected: {
					title: 'a',
					wordpress: testReleaseTag,
				},
				default: {
					multisite: true,
				},
			},
			{
				preselected: {
					title: 'a',
					wordpress: testReleaseTag,
				},
				default: {
					multisite: false,
				},
			},
		] )( 'should handle multisite', async input => {
			confirmRunMock.mockResolvedValue( input.default.multisite );

			const result = await promptForArguments( input.preselected, input.default );

			if ( 'multisite' in input.preselected ) {
				expect( confirmRunMock ).toHaveBeenCalledTimes( 0 );
			} else {
				expect( confirmRunMock ).toHaveBeenCalledTimes( 1 );
			}

			const expectedValue = 'multisite' in input.preselected ? input.preselected.multisite : input.default.multisite;

			expect( result.multisite ).toStrictEqual( expectedValue );
		} );
		it.each( [
			{
				preselected: {
					title: 'a',
					multisite: true,
					mediaRedirectDomain: 'a',
					wordpress: testReleaseTag,
				},
				default: {
					mediaRedirectDomain: 'b',
				},
			},
			{
				preselected: {
					title: 'a',
					multisite: true,
					wordpress: testReleaseTag,
				},
				default: {
					mediaRedirectDomain: 'b',
				},
			},
		] )( 'should handle media redirect query', async input => {
			confirmRunMock.mockResolvedValue( input.default.mediaRedirectDomain );

			const result = await promptForArguments( input.preselected, input.default );

			if ( input.preselected.mediaRedirectDomain ) {
				expect( confirmRunMock ).toHaveBeenCalledTimes( 0 );
			} else {
				expect( confirmRunMock ).toHaveBeenCalledTimes( 1 );
			}

			const expectedValue = input.preselected.mediaRedirectDomain ? input.preselected.mediaRedirectDomain : input.default.mediaRedirectDomain;

			expect( result.mediaRedirectDomain ).toStrictEqual( expectedValue );
		} );

		it.each( [
			{
				preselected: {
					title: 'a',
					wordpress: testReleaseTag,
					mariadb: 'maria_a',
					elasticsearch: 'elastic_a',
				},
				default: {
				},
			},
			{
				preselected: {
					title: 'a',
					wordpress: testReleaseTag,
				},
				default: {
					mariadb: 'maria_b',
					elasticsearch: 'elastic_b',
				},
			},
		] )( 'should handle elasticsearch/mariadb', async input => {
			const result = await promptForArguments( input.preselected, input.default );

			const expectedMaria = input.preselected.mariadb ? input.preselected.mariadb : input.default.mariadb;
			const expectedElastic = input.preselected.elasticsearch ? input.preselected.elasticsearch : input.default.elasticsearch;

			expect( result.mariadb ).toStrictEqual( expectedMaria );
			expect( result.elasticsearch ).toStrictEqual( expectedElastic );
		} );
		it.each( [
			{
				service: 'statsd',
				preselected: true,
				expected: true,
				wordpress: testReleaseTag,
			},
			{
				service: 'statsd',
				expected: false,
				wordpress: testReleaseTag,
			},
			{
				service: 'statsd',
				default: true,
				expected: true,
				wordpress: testReleaseTag,
			},
			{
				service: 'statsd',
				preselected: false,
				default: true,
				expected: false,
				wordpress: testReleaseTag,
			},
			{
				service: 'phpmyadmin',
				preselected: true,
				default: true,
				expected: true,
				wordpress: testReleaseTag,
			},
			{
				service: 'xdebug',
				default: true,
				expected: true,
				wordpress: testReleaseTag,
			},
		] )( 'should handle auxiliary services', async input => {
			const preselected = {};
			const defaultOptions = {};
			if ( 'preselected' in input ) {
				preselected[ input.service ] = input.preselected;
			}
			if ( 'default' in input ) {
				defaultOptions[ input.service ] = input.default;
			}
			if ( 'wordpress' in input ) {
				preselected.wordpress = input.wordpress;
			}
			const result = await promptForArguments( preselected, defaultOptions );

			expect( result[ input.service ] ).toStrictEqual( input.expected );
		} );
	} );
} );
