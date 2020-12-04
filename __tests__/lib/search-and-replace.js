/**
 * External dependencies
 */
import fs from 'fs';
import path from 'path';
import suffix from 'suffix';
import fetch, { Response } from 'node-fetch';

/**
 * Internal dependencies
 */
import { searchAndReplace } from 'lib/search-and-replace';

global.console = { log: jest.fn(), error: jest.fn() };
jest.mock( 'node-fetch' );

// Mock console.log()
jest.spyOn( global.console, 'log' );
fetch.mockReturnValue( Promise.resolve( new Response( 'ok' ) ) );
let testFilePath, outputFilePath;

describe( 'lib/search-and-replace', () => {
	beforeEach( () => {
		testFilePath = path.join( process.cwd(), '__fixtures__', 'client-file-uploader', 'tinyfile.txt' );
		outputFilePath = suffix( testFilePath, '.out' );
	} );
	afterEach( () => {
		if ( fs.existsSync( outputFilePath ) ) {
			fs.unlinkSync( outputFilePath );
		}
	} );
	it( 'returns the input file path if no pairs are provided by an array', async () => {
		const result = await searchAndReplace( testFilePath, [], { isImport: false, inPlace: false } );
		expect( result ).toBe( testFilePath );
	} );
	it( 'returns the input file path if no pairs are provided by a string', async () => {
		const result = await searchAndReplace( testFilePath, '', { isImport: false, inPlace: false } );
		expect( result ).toBe( testFilePath );
	} );
	it( 'will accept and use a string of replacement pairs (when one replacement provided)', async () => {
		const result = await searchAndReplace( testFilePath, 'ohai,ohHey', { isImport: false, inPlace: false } );
		expect( result ).toBe( outputFilePath );
		const fileContents = fs.readFileSync( outputFilePath, { encoding: 'utf-8' } );
		expect( fileContents ).toContain( 'ohHey' );
		expect( fileContents ).not.toContain( 'ohai' );
	} );
	it( 'will accept and use an array of replacement pairs (when multiple replacement provided)', async () => {
		const result = await searchAndReplace( testFilePath, [ 'ohai,ohHey', 'purty,pretty' ], { isImport: false, inPlace: false } );
		expect( result ).toBe( outputFilePath );
		const fileContents = fs.readFileSync( outputFilePath, { encoding: 'utf-8' } );
		expect( fileContents ).toContain( 'ohHey' );
		expect( fileContents ).toContain( 'pretty' );
		expect( fileContents ).not.toContain( 'ohai' );
		expect( fileContents ).not.toContain( 'purty' );
	} );
} );
