import path from 'node:path';

import {
	getEnvFilePath,
	parseEnvValue,
	preparseEnvData,
	quoteEnvValue,
} from '../../../src/lib/dev-environment/env-vars';
import { xdgData } from '../../../src/lib/xdg-data';

describe( 'preparseEnvData', () => {
	it( 'should ignore empty lines', () => {
		const input = `\n\n\r\n`;
		const expected = [];
		const actual = preparseEnvData( input );
		expect( actual ).toEqual( expected );
	} );

	it( 'should ignore comments', () => {
		const input = `# This is a comment\n# Another comment\n`;
		const expected = [];
		const actual = preparseEnvData( input );
		expect( actual ).toEqual( expected );
	} );

	it( 'should ignore whitespace-only lines', () => {
		const input = `   \n\t\n\r\n`;
		const expected = [];
		const actual = preparseEnvData( input );
		expect( actual ).toEqual( expected );
	} );

	it( 'should return non-empty lines', () => {
		const input = `KEY1=VALUE1\n KEY2=VALUE2 \n`;
		const expected = [ 'KEY1=VALUE1', 'KEY2=VALUE2' ];
		const actual = preparseEnvData( input );
		expect( actual ).toEqual( expected );
	} );
} );

describe( 'parseEnvValue', () => {
	it( 'should return unquoted values as is', () => {
		const input = 'VALUE';
		const expected = input;
		const actual = parseEnvValue( input );
		expect( actual ).toEqual( expected );
	} );

	it( 'should unescape single quotes inside single quotes', () => {
		const input = "'single\\'quote'";
		const expected = "single'quote";
		const actual = parseEnvValue( input );
		expect( actual ).toEqual( expected );
	} );

	it( 'should ignore special characters in single quotes', () => {
		const input = `'\\n\\r\\t\\\\$$"'`;
		const expected = `\\n\\r\\t\\\\$$"`;
		const actual = parseEnvValue( input );
		expect( actual ).toEqual( expected );
	} );

	it( 'should correctly process values in double quotes', () => {
		const input = `"\\n\\r\\t\\\\\\$\\""`;
		const expected = `\n\r\t\\$"`;
		const actual = parseEnvValue( input );
		expect( actual ).toEqual( expected );
	} );
} );

describe( 'quoteEnvValue', () => {
	it( 'should properly quote values', () => {
		const input = 'this is a\tmultiline\r\nvalue with special characters: $\'"\\';
		const expected = `"this is a\\tmultiline\\r\\nvalue with special characters: \\$'\\"\\\\"`;
		const actual = quoteEnvValue( input );
		expect( actual ).toEqual( expected );
	} );
} );

describe( 'getEnvFilePath', () => {
	it( 'should return the correct path for a given slug', () => {
		const slug = 'vip-local';
		const expected = path.join( `${ xdgData() }`, 'vip', 'dev-environment', slug, '.env' );
		const actual = getEnvFilePath( slug, false );
		return expect( actual ).resolves.toEqual( expected );
	} );
} );
