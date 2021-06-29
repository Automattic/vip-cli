/**
 * @format
 */

/**
 * External dependencies
 */
import fs from 'fs';
import path from 'path';
import fetch, { Response } from 'node-fetch';
import searchReplaceLib from '@automattic/vip-search-replace';

/**
 * Internal dependencies
 */
import { searchAndReplace } from 'lib/search-and-replace';
// Import prompt as a module since that's how we implement it in lib/search-and-replace.js,
// as opposed to importing prompt.confirm on its own
import * as prompt from 'lib/cli/prompt';
import * as apiConfig from 'lib/cli/apiConfig';

global.console = { log: jest.fn(), error: jest.fn() };

const fixtureDir = path.resolve( __dirname, '..', '..', '__fixtures__' );
const testFilePath = path.resolve( fixtureDir, 'client-file-uploader', 'tinyfile.txt' );

jest.mock( 'node-fetch' );
fetch.mockReturnValue( Promise.resolve( new Response( 'ok' ) ) );

jest.spyOn( apiConfig, 'checkIfUserIsVip' ).mockResolvedValue( true );

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
		// Mock the confirmation prompt so it doesn't actually prompt, and manipulate the resolved value
		const promptMock = await jest.spyOn( prompt, 'confirm' ).mockResolvedValue( true );

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

		// Clean up
		fs.unlinkSync( outputFileName );
		promptMock.mockClear(); // Clear the mock
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

	it( 'will remove whitespace from the beginning and end of pairs', async () => {
		jest.spyOn( searchReplaceLib, 'replace' );
		const replaceSpy = searchReplaceLib.replace;

		await searchAndReplace(
			testFilePath,
			[ ' ohai		,\t\n\tohHey\t\n\r', '	  purty		, \t\n\rpretty\t\n ' ], // tabs spaces, LFs
			{ output: true },
			binary
		);

		expect( replaceSpy ).toHaveBeenCalledWith( expect.any( Object ), [
			'ohai',
			'ohHey',
			'purty',
			'pretty',
		], expect.anything() );

		replaceSpy.mockClear();
	} );
} );
