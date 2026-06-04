import fs from 'fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import os from 'os';
import path from 'path';

import { MyDumperSectionSizeTransform, patchMyDumperSectionSizes } from '../../src/lib/database';

/**
 * Builds a mydumper-style stream: each section is a "-- <name> <size>" header line
 * followed by its content (ending with its own newline) and a separator newline
 * before the next header. The final section runs to end of stream.
 */
const buildStream = sections =>
	sections
		.map( ( { name, declaredSize, content }, index ) => {
			const separator = index === sections.length - 1 ? '' : '\n';
			return `-- ${ name } ${ declaredSize }\n${ content }${ separator }`;
		} )
		.join( '' );

const runTransform = async ( input, { chunkSize = 8 } = {} ) => {
	const chunks = [];
	for ( let offset = 0; offset < input.length; offset += chunkSize ) {
		chunks.push( Buffer.from( input.slice( offset, offset + chunkSize ), 'latin1' ) );
	}

	const transform = new MyDumperSectionSizeTransform();
	const outputFile = path.join(
		fs.mkdtempSync( path.join( os.tmpdir(), 'mydumper-transform-test-' ) ),
		'out.sql'
	);
	await pipeline( Readable.from( chunks ), transform, fs.createWriteStream( outputFile ) );
	await patchMyDumperSectionSizes( outputFile, transform );

	return { transform, outputFile, output: fs.readFileSync( outputFile, 'latin1' ) };
};

const parseHeaders = output => {
	const headers = [];
	const regex = /^-- ([^ ]+) (\d+)$/gm;
	let match;
	while ( ( match = regex.exec( output ) ) !== null ) {
		headers.push( {
			name: match[ 1 ],
			size: parseInt( match[ 2 ], 10 ),
			start: match.index,
			end: match.index + match[ 0 ].length,
		} );
	}
	return headers;
};

describe( 'lib/database', () => {
	describe( 'MyDumperSectionSizeTransform', () => {
		it( 'recomputes section sizes from actual content (stale sizes after search-replace)', async () => {
			// Declared sizes are stale on purpose: content was "search-replaced".
			const metadata = '# Started dump\n[config]\nquote-character = BACKTICK\n';
			const schema = 'CREATE TABLE `wp_options` (`id` bigint);\n';
			const data = "INSERT INTO `wp_options` VALUES (1,'new.domain');\n";
			const input = buildStream( [
				{ name: 'metadata.header', declaredSize: 9999, content: metadata },
				{ name: 'db.wp_options-schema.sql', declaredSize: 1, content: schema },
				{ name: 'db.wp_options.00000.sql', declaredSize: 12345, content: data },
			] );

			const { output } = await runTransform( input );
			const headers = parseHeaders( output );

			expect( headers ).toHaveLength( 3 );
			expect( headers[ 0 ].size ).toBe( metadata.length );
			expect( headers[ 1 ].size ).toBe( schema.length );
			expect( headers[ 2 ].size ).toBe( data.length );
		} );

		it( 'preserves content bytes exactly and keeps the size convention parseable', async () => {
			const content1 = 'line one\nline two\n';
			const content2 = "INSERT INTO `t` VALUES ('x');\n";
			const input = buildStream( [
				{ name: 'metadata.header', declaredSize: 0, content: content1 },
				{ name: 'db.t.00000.sql', declaredSize: 0, content: content2 },
			] );

			const { output } = await runTransform( input );
			const headers = parseHeaders( output );

			// Re-derive each section's content from the declared size and compare:
			// size counts content bytes; one separator newline precedes the next header.
			const section1 = output.slice(
				headers[ 0 ].end + 1,
				headers[ 0 ].end + 1 + headers[ 0 ].size
			);
			expect( section1 ).toBe( content1 );
			expect( output[ headers[ 0 ].end + 1 + headers[ 0 ].size ] ).toBe( '\n' );

			const section2 = output.slice(
				headers[ 1 ].end + 1,
				headers[ 1 ].end + 1 + headers[ 1 ].size
			);
			expect( section2 ).toBe( content2 );
		} );

		it.each( [ 1, 3, 7, 64 ] )(
			'is chunk-boundary safe (chunk size %i splits headers mid-line)',
			async chunkSize => {
				const content = 'some content here\n';
				const input = buildStream( [
					{ name: 'metadata.header', declaredSize: 5, content },
					{ name: 'db.table-schema.sql', declaredSize: 5, content },
				] );

				const { output } = await runTransform( input, { chunkSize } );
				const headers = parseHeaders( output );

				expect( headers ).toHaveLength( 2 );
				expect( headers[ 0 ].size ).toBe( content.length );
				expect( headers[ 1 ].size ).toBe( content.length );
			}
		);

		it( 'documents the known limitation: content lines shaped "-- <token> <digits>" are treated as headers', async () => {
			// mydumper never emits such content lines (string newlines are escaped, so content
			// cannot begin a line with "-- "), but a hand-edited dump could contain one. This
			// test documents the behavior so a future change here is deliberate, not accidental.
			const content = 'real content\n-- handwritten_note 42\nmore content\n';
			const input = buildStream( [ { name: 'metadata.header', declaredSize: 1, content } ] );

			const { transform } = await runTransform( input );

			// The phantom line is counted as a section boundary.
			expect( transform.fixups ).toHaveLength( 2 );
		} );

		it( 'does not treat header-looking content lines without a numeric size as headers', async () => {
			const content = '-- this is just a comment\n-- not a header either\n';
			const input = buildStream( [ { name: 'metadata.header', declaredSize: 1, content } ] );

			const { output, transform } = await runTransform( input );

			expect( transform.fixups ).toHaveLength( 1 );
			expect( parseHeaders( output ) ).toHaveLength( 1 );
			expect( output ).toContain( content );
		} );

		it( 'handles a final section without a trailing newline', async () => {
			const content = 'no trailing newline';
			const input = `-- metadata.header 5\n${ content }`;

			const { output, transform } = await runTransform( input );

			expect( transform.fixups[ 0 ].size ).toBe( content.length );
			expect( parseHeaders( output )[ 0 ].size ).toBe( content.length );
		} );
	} );
} );
