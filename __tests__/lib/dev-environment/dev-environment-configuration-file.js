/**
 * @format
 */

import { jest } from '@jest/globals';
import { readFile } from 'node:fs/promises';

import { getConfigurationFileOptions } from '../../../src/lib/dev-environment/dev-environment-configuration-file';

// Mock fs operations
jest.mock( 'node:fs/promises' );

// Mock exit module to prevent actual process exits during tests
jest.mock( '../../../src/lib/cli/exit', () => ( {
	withError: jest.fn( message => {
		throw new Error( message );
	} ),
} ) );

const mockedReadFile = readFile;

describe( 'dev-environment-configuration-file', () => {
	describe( 'multisite configuration sanitization', () => {
		const createConfigContent = multisiteValue => `
configuration-version: 1
slug: test-site
multisite: ${ multisiteValue }
mu-plugins: demo
app-code: demo
`;

		beforeEach( () => {
			jest.clearAllMocks();
			jest.resetAllMocks();
			// Mock process.cwd() to return a known directory
			jest.spyOn( process, 'cwd' ).mockReturnValue( '/test/dir' );
			// Default mock to reject all file reads
			mockedReadFile.mockRejectedValue( new Error( 'File not found' ) );
		} );

		afterEach( () => {
			jest.restoreAllMocks();
		} );

		it.each( [
			{ input: 'subdirectory', expected: 'subdirectory', description: 'subdirectory string' },
			{ input: 'subdomain', expected: 'subdomain', description: 'subdomain string' },
			{ input: 'y', expected: true, description: 'y (yes) results in true (subdomain multisite)' },
			{ input: 'yes', expected: true, description: 'yes results in true (subdomain multisite)' },
			{ input: 'true', expected: true, description: 'true results in true (subdomain multisite)' },
			{ input: '1', expected: true, description: '1 results in true (subdomain multisite)' },
			{ input: 'false', expected: false, description: 'false becomes boolean false' },
			{ input: 'no', expected: false, description: 'no becomes boolean false' },
			{ input: 'n', expected: false, description: 'n becomes boolean false' },
			{ input: '0', expected: false, description: '0 becomes boolean false' },
		] )(
			'should sanitize multisite: $input to $expected ($description)',
			async ( { input, expected } ) => {
				const configContent = createConfigContent( input );

				mockedReadFile.mockResolvedValueOnce( configContent );

				const result = await getConfigurationFileOptions();

				expect( result.multisite ).toStrictEqual( expected );
				expect( result.slug ).toBe( 'test-site' );
				expect( result.version ).toBe( '1' );
			}
		);

		it.each( [
			{ input: 'SUBDIRECTORY', expected: false },
			{ input: 'SubDomain', expected: false },
			{ input: 'Y', expected: true },
			{ input: 'TRUE', expected: true },
			{ input: 'FALSE', expected: false },
		] )(
			'should handle case-sensitive multisite values (case changes result in false): $input to $expected',
			async ( { input, expected } ) => {
				const configContent = createConfigContent( input );

				mockedReadFile.mockResolvedValueOnce( configContent );

				const result = await getConfigurationFileOptions();

				expect( result.multisite ).toStrictEqual( expected );
				expect( result.slug ).toBe( 'test-site' );
				expect( result.version ).toBe( '1' );
			}
		);

		it( 'should ignore invalid multisite values and set to false', async () => {
			const configContent = createConfigContent( 'invalid-value' );

			mockedReadFile.mockResolvedValueOnce( configContent );

			const result = await getConfigurationFileOptions();

			// Invalid values should result in the default value (false)
			expect( result.multisite ).toBe( false );
			expect( result.slug ).toBe( 'test-site' );
		} );

		it( 'should handle non-string multisite values', async () => {
			// Test with a config that has a non-string value (like a number or boolean from YAML)
			const configContentWithBoolean = `
configuration-version: 1
slug: test-site
multisite: true
mu-plugins: demo
app-code: demo
`;

			mockedReadFile.mockResolvedValueOnce( configContentWithBoolean );

			const result = await getConfigurationFileOptions();

			// Boolean true should be treated as multisite enabled (boolean true)
			expect( result.multisite ).toStrictEqual( true );
		} );

		it( 'should return empty object when no configuration file is found', async () => {
			mockedReadFile.mockRejectedValue( new Error( 'File not found' ) );

			const result = await getConfigurationFileOptions();

			expect( result ).toEqual( {} );
		} );
	} );
} ); 