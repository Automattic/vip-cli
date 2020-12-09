/**
 * @format
 */

/**
 * External dependencies
 */
import fs from 'fs';
import path from 'path';
import fetch, { Response } from 'node-fetch';

/**
 * Internal dependencies
 */
import { searchAndReplace } from 'lib/search-and-replace';

global.console = { log: jest.fn(), error: jest.fn() };

const baseDir = path.resolve( __dirname, '..', '..' );
const fixtureDir = path.resolve( baseDir, '__fixtures__' );
const testFilePath = path.resolve( fixtureDir, 'client-file-uploader', 'tinyfile.txt' );

jest.mock( 'node-fetch' );
fetch.mockReturnValue( Promise.resolve( new Response( 'ok' ) ) );

const binary = path.resolve(
	fixtureDir,
	'search-replace-binaries',
	`go-search-replace-test-${ process.platform }-${ process.arch }`
);

// Mock console.log()
jest.spyOn( global.console, 'log' );

describe( 'lib/search-and-replace', () => {
	it( 'should throw for empty pair array', async () => {
		const promise = searchAndReplace( testFilePath, [], {}, binary );
		await expect( promise ).rejects.toEqual(
			new Error( 'No search and replace parameters provided.' )
		);
	} );
	it( 'should throw for empty pair string', async () => {
		const promise = searchAndReplace( testFilePath, '', {}, binary );
		await expect( promise ).rejects.toEqual(
			new Error( 'No search and replace parameters provided.' )
		);
	} );
	it( 'will accept and use a string of replacement pairs (when one replacement provided)', async () => {
		const { usingStdOut, outputFileName } = await searchAndReplace(
			testFilePath,
			'ohai,ohHey',
			{ output: true },
			binary
		);

		expect( usingStdOut ).toBe( false );
		expect( outputFileName ).not.toBe( testFilePath );

		const fileContents = fs.readFileSync( outputFileName, { encoding: 'utf-8' } );
		expect( fileContents ).toContain( 'ohHey' );
		expect( fileContents ).not.toContain( 'ohai' );
		fs.unlinkSync( outputFileName );
	} );

	it( 'will accept and use an array of replacement pairs (when multiple replacement provided)', async () => {
		const { usingStdOut, outputFileName } = await searchAndReplace(
			testFilePath,
			[ 'ohai,ohHey', 'purty,pretty' ],
			{ output: true },
			binary
		);

		expect( usingStdOut ).toBe( false );
		expect( outputFileName ).not.toBe( testFilePath );

		const fileContents = fs.readFileSync( outputFileName, { encoding: 'utf-8' } );
		expect( fileContents ).toContain( 'ohHey' );
		expect( fileContents ).not.toContain( 'ohai' );
		expect( fileContents ).toContain( 'pretty' );
		expect( fileContents ).not.toContain( 'purty' );
		fs.unlinkSync( outputFileName );
	} );
} );
