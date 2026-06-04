/**
 * @format
 */

import searchReplaceLib from '@automattic/vip-search-replace';
import fs from 'fs';
import fetch, { Response } from 'node-fetch';
import path from 'path';

import * as prompt from '../../src/lib/cli/prompt';
import { searchAndReplace } from '../../src/lib/search-and-replace';
// Import prompt as a module since that's how we implement it in lib/search-and-replace.js,
// as opposed to importing prompt.confirm on its own

global.console = { log: jest.fn(), error: jest.fn() };

const fixtureDir = path.resolve( __dirname, '..', '..', '__fixtures__' );
const testFilePath = path.resolve( fixtureDir, 'client-file-uploader', 'tinyfile.txt' );

jest.mock( 'node-fetch' );
fetch.mockReturnValue( Promise.resolve( new Response( 'ok' ) ) );

let searchReplaceBinaryFilename = `go-search-replace-test-${ process.platform }-${ process.arch }`;
if ( 'win32' === process.platform ) {
	searchReplaceBinaryFilename += '.exe';
}

const binary = path.resolve( fixtureDir, 'search-replace-binaries', searchReplaceBinaryFilename );

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
	it( 'should throw for compressed input files', async () => {
		const promise = searchAndReplace( '/tmp/some-dump.sql.GZ', 'a,b', {}, binary );
		await expect( promise ).rejects.toThrow( 'Compressed files are not supported' );
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

	it( 'recomputes mydumper section header sizes after replacement changes content length', async () => {
		// Minimal mydumper-format stream dump. Sizes follow the mydumper convention:
		// content bytes including the content's own trailing newline, with a single
		// separator newline before the next header; final section runs to EOF.
		const metadata = '# Started dump\n[config]\nquote-character = BACKTICK\n';
		const schemaCreate = 'CREATE DATABASE `testdb`;\n';
		const data = "INSERT INTO `wp_options` VALUES ('ohai world, ohai');\n";
		const myDumperFile = path.join(
			fs.mkdtempSync( path.join( require( 'os' ).tmpdir(), 'mydumper-sr-test-' ) ),
			'dump.sql'
		);
		fs.writeFileSync(
			myDumperFile,
			`-- metadata.header ${ metadata.length }\n${ metadata }\n` +
				`-- testdb-schema-create.sql ${ schemaCreate.length }\n${ schemaCreate }\n` +
				`-- testdb.wp_options.00000.sql ${ data.length }\n${ data }`
		);

		const { outputFileName } = await searchAndReplace(
			myDumperFile,
			'ohai,ohHeyLongerValue',
			{ output: true },
			binary
		);

		const result = fs.readFileSync( outputFileName, { encoding: 'utf-8' } );

		// Replacement happened
		expect( result ).toContain( 'ohHeyLongerValue' );
		expect( result ).not.toContain( 'ohai' );

		// Every header's declared size must match the actual content that follows it
		const headerRegex = /^-- ([^ ]+) (\d+)$/gm;
		const headers = [];
		let match;
		while ( ( match = headerRegex.exec( result ) ) !== null ) {
			headers.push( {
				size: parseInt( match[ 2 ], 10 ),
				contentStart: match.index + match[ 0 ].length + 1,
			} );
		}
		expect( headers ).toHaveLength( 3 );

		headers.forEach( ( { size, contentStart } ) => {
			expect( result.slice( contentStart, contentStart + size ).length ).toBe( size );
		} );

		// a single separator newline must follow each section's content before the next header
		headers.slice( 0, -1 ).forEach( ( { size, contentStart } ) => {
			expect( result[ contentStart + size ] ).toBe( '\n' );
			expect( result.slice( contentStart + size + 1, contentStart + size + 4 ) ).toBe( '-- ' );
		} );

		// final section runs exactly to end of stream
		const lastHeader = headers[ headers.length - 1 ];
		expect( lastHeader.contentStart + lastHeader.size ).toBe( result.length );

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

		expect( replaceSpy ).toHaveBeenCalledWith(
			expect.any( Object ),
			[ 'ohai', 'ohHey', 'purty', 'pretty' ],
			expect.anything()
		);

		replaceSpy.mockClear();
	} );
} );
