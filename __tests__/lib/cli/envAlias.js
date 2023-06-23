/**
 * External dependencies
 */
import { describe, it, expect } from '@jest/globals';

/**
 * Internal dependencies
 */
import { isAlias, parseEnvAlias, parseEnvAliasFromArgv } from '../../../src/lib/cli/envAlias';

describe( 'utils/cli/envAlias', () => {
	describe( 'isAlias()', () => {
		it.each( [
			'@app',
			'@app-name',
			'@app.env',
			'@app-name.env',
			'@app-name.env-name',
			'@app-name.env-01',
			'@app.env.instance',
			'@app.env.instance-name',
			'@app.env.instance-01',
			'@1',
			'@1.env',
			'@2.MixedCaseEnv',
		] )( 'should identify valid aliases - %p', alias => {
			expect( isAlias( alias ) ).toBe( true );
		} );
	} );

	describe( 'parseEnvAlias()', () => {
		it.each( [
			{
				alias: '@app',
				app: 'app',
				env: undefined,
			},
			{
				alias: '@app-name',
				app: 'app-name',
				env: undefined,
			},
			{
				alias: '@app.env',
				app: 'app',
				env: 'env',
			},
			{
				alias: '@app-name.env',
				app: 'app-name',
				env: 'env',
			},
			{
				alias: '@app-name.env-name',
				app: 'app-name',
				env: 'env-name',
			},
			{
				alias: '@app-name.env-01',
				app: 'app-name',
				env: 'env-01',
			},
			{
				alias: '@app-name.env.instance',
				app: 'app-name',
				env: 'env.instance',
			},
			{
				alias: '@app-name.env.instance-name',
				app: 'app-name',
				env: 'env.instance-name',
			},
			{
				alias: '@app-name.env.instance-01',
				app: 'app-name',
				env: 'env.instance-01',
			},
			{
				alias: '@1',
				app: '1',
				env: undefined,
			},
			{
				alias: '@1.env',
				app: '1',
				env: 'env',
			},
			{
				alias: '@1.env.instance',
				app: '1',
				env: 'env.instance',
			},
			{
				alias: '@2.Env.instance',
				app: '2',
				env: 'env.instance',
			},
		] )( 'should parse out the app and env from an alias', input => {
			const parsed = parseEnvAlias( input.alias );

			expect( parsed ).toEqual( { app: input.app, env: input.env } );
		} );
	} );

	describe( 'parseEnvAliasFromArgv()', () => {
		it.each( [
			{
				argv: [ '/usr/local/bin/node', '/path/to/script.js' ],
				expected: {
					argv: [ '/usr/local/bin/node', '/path/to/script.js' ],
				},
			},
			{
				argv: [ '/usr/local/bin/node', '/path/to/script.js', '@app.env' ],
				expected: {
					argv: [ '/usr/local/bin/node', '/path/to/script.js' ],
					app: 'app',
					env: 'env',
				},
			},
			{
				argv: [ '/usr/local/bin/node', '/path/to/script.js', '@app.env', 'command' ],
				expected: {
					argv: [ '/usr/local/bin/node', '/path/to/script.js', 'command' ],
					app: 'app',
					env: 'env',
				},
			},
			{
				argv: [
					'/usr/local/bin/node',
					'/path/to/script.js',
					'@app.env',
					'command',
					'--somearg=value',
				],
				expected: {
					argv: [ '/usr/local/bin/node', '/path/to/script.js', 'command', '--somearg=value' ],
					app: 'app',
					env: 'env',
				},
			},
			{
				argv: [
					'/usr/local/bin/node',
					'/path/to/script.js',
					'@app.env',
					'command',
					'--',
					'@not-an-alias',
				],
				expected: {
					argv: [ '/usr/local/bin/node', '/path/to/script.js', 'command', '--', '@not-an-alias' ],
					app: 'app',
					env: 'env',
				},
			},
		] )( 'should parse the alias from argv - %p', input => {
			const result = parseEnvAliasFromArgv( input.argv );

			expect( result ).toEqual( input.expected );
		} );
	} );
} );
