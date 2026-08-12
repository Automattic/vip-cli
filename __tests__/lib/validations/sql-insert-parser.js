/**
 * @format
 */

import {
	DEFAULT_OPTIONS_INSERT_COLUMNS,
	INSERT_STATEMENT_MODIFIERS,
	checkRequiresOptionsInsertContext,
	findValuesKeyword,
	findValuesKeywordIndex,
	getInsertStatementInfo,
	getOptionUrlMatchResults,
	isEscapedByBackslash,
	isWordPressOptionsTable,
	normalizeSqlIdentifier,
	parseInsertColumnList,
	parseInsertColumnListSegment,
	parseSqlTupleRows,
	readSqlIdentifier,
	skipSqlWhitespace,
	stripSqlCommentsOutsideQuotedStrings,
	unquoteSqlValue,
} from '../../../src/lib/validations/sql-insert-parser';

describe( 'sql-insert-parser', () => {
	describe( 'constants', () => {
		it( 'exposes the canonical INSERT statement modifiers', () => {
			expect( INSERT_STATEMENT_MODIFIERS ).toBeInstanceOf( Set );
			expect( [ ...INSERT_STATEMENT_MODIFIERS ].sort() ).toEqual( [
				'DELAYED',
				'HIGH_PRIORITY',
				'IGNORE',
				'LOW_PRIORITY',
			] );
		} );

		it( 'exposes the default wp_options column ordering', () => {
			expect( DEFAULT_OPTIONS_INSERT_COLUMNS ).toEqual( [
				'option_id',
				'option_name',
				'option_value',
				'autoload',
			] );
		} );
	} );

	describe( 'skipSqlWhitespace', () => {
		it.each( [
			[ 'returns startIndex when the current character is non-whitespace', 'abc', 0, 0 ],
			[ 'returns startIndex when the current character is non-whitespace', 'abc', 1, 1 ],
			[ 'skips a run of plain spaces', '   abc', 0, 3 ],
			[ 'skips a run of mixed whitespace including tabs and newlines', ' \t\n abc', 0, 4 ],
			[
				'returns line.length when whitespace runs to end of string',
				'   \t\n',
				0,
				'   \t\n'.length,
			],
			[ 'returns startIndex when startIndex is at or past end of line', 'abc', 3, 3 ],
			[ 'returns startIndex when startIndex is at or past end of line', 'abc', 10, 10 ],
		] )( '%s', ( _name, line, startIndex, expected ) => {
			expect( skipSqlWhitespace( line, startIndex ) ).toBe( expected );
		} );
	} );

	describe( 'readSqlIdentifier', () => {
		it.each( [
			[ 'returns undefined when only whitespace remains', '   ', 0, undefined ],
			[
				'reads a bare identifier and returns endIndex past its last char',
				'wp_options foo',
				0,
				{
					name: 'wp_options',
					endIndex: 10,
				},
			],
			[
				'reads a backtick-quoted identifier and returns endIndex past the closing backtick',
				'`my db`.tbl',
				0,
				{
					name: 'my db',
					endIndex: 7,
				},
			],
			[ 'returns undefined when an opening backtick is not closed', '`unterminated', 0, undefined ],
			[
				'returns undefined when the next non-whitespace char is non-identifier punctuation',
				'(foo)',
				0,
				undefined,
			],
			[
				'skips leading whitespace before reading the identifier',
				'   wp_options',
				0,
				{
					name: 'wp_options',
					endIndex: 13,
				},
			],
		] )( '%s', ( _name, line, startIndex, expected ) => {
			expect( readSqlIdentifier( line, startIndex ) ).toEqual( expected );
		} );
	} );

	describe( 'getInsertStatementInfo', () => {
		it( 'returns undefined for non-INSERT lines', () => {
			expect( getInsertStatementInfo( 'SELECT * FROM wp_options' ) ).toBeUndefined();
		} );

		it.each( [
			[
				'INSERT INTO wp_options (option_name) VALUES ("home")',
				{
					tableName: 'wp_options',
					tableEndIndex: 'INSERT INTO wp_options'.length,
				},
			],
			[
				'REPLACE INTO wp_options (option_name) VALUES ("home")',
				{
					tableName: 'wp_options',
					tableEndIndex: 'REPLACE INTO wp_options'.length,
				},
			],
			[
				'INSERT IGNORE INTO wp_options (option_name) VALUES ("home")',
				{
					tableName: 'wp_options',
					tableEndIndex: 'INSERT IGNORE INTO wp_options'.length,
				},
			],
			[
				'INSERT LOW_PRIORITY IGNORE INTO wp_options (option_name) VALUES ("home")',
				{
					tableName: 'wp_options',
					tableEndIndex: 'INSERT LOW_PRIORITY IGNORE INTO wp_options'.length,
				},
			],
			[
				'INSERT DELAYED INTO wp_options VALUES ("home")',
				{
					tableName: 'wp_options',
					tableEndIndex: 'INSERT DELAYED INTO wp_options'.length,
				},
			],
			[
				'INSERT HIGH_PRIORITY INTO wp_options VALUES ("home")',
				{
					tableName: 'wp_options',
					tableEndIndex: 'INSERT HIGH_PRIORITY INTO wp_options'.length,
				},
			],
			[
				'INSERT INTO db.wp_options (option_name) VALUES ("home")',
				{
					tableName: 'wp_options',
					tableEndIndex: 'INSERT INTO db.wp_options'.length,
				},
			],
			[
				'INSERT INTO `db`.`wp_options` (option_name) VALUES ("home")',
				{
					tableName: 'wp_options',
					tableEndIndex: 'INSERT INTO `db`.`wp_options`'.length,
				},
			],
			[
				'insert into wp_options (option_name) VALUES ("home")',
				{
					tableName: 'wp_options',
					tableEndIndex: 'insert into wp_options'.length,
				},
			],
			[
				'INSERT wp_options VALUES ("home")',
				{
					tableName: 'wp_options',
					tableEndIndex: 17,
				},
			],
			[
				'INSERT INTO wp_options',
				{
					tableName: 'wp_options',
					tableEndIndex: 'INSERT INTO wp_options'.length,
				},
			],
		] )( 'resolves table info in %s', ( line, expected ) => {
			expect( getInsertStatementInfo( line ) ).toEqual( expected );
		} );
	} );

	describe( 'isWordPressOptionsTable', () => {
		it.each( [
			[ true, 'wp_options' ],
			[ true, 'WP_Options' ],
			[ true, 'wp_2_options' ],
			[ true, 'wp_12_options' ],
			[ false, 'wp__options' ],
			[ false, 'wp_a_options' ],
			[ false, 'wp_2a_options' ],
			[ false, 'wp_posts' ],
			[ false, 'options' ],
			[ false, undefined ],
		] )( 'returns %s for table %s', ( expected, tableName ) => {
			expect( isWordPressOptionsTable( tableName ) ).toBe( expected );
		} );
	} );

	describe( 'checkRequiresOptionsInsertContext', () => {
		it.each( [
			[ 'returns true for siteHomeUrl', 'siteHomeUrl', true ],
			[ 'returns true for siteHomeUrlLando', 'siteHomeUrlLando', true ],
			[ 'returns false for unrelated check keys', 'binaryLogging', false ],
			[ 'returns false for the empty string', '', false ],
		] )( '%s', ( _name, checkKey, expected ) => {
			expect( checkRequiresOptionsInsertContext( checkKey ) ).toBe( expected );
		} );
	} );

	describe( 'normalizeSqlIdentifier', () => {
		it.each( [
			[ 'returns a bare lowercase identifier unchanged', 'option_name', 'option_name' ],
			[ 'strips surrounding backticks', '`option_name`', 'option_name' ],
			[ 'lowercases uppercase identifiers', 'OPTION_NAME', 'option_name' ],
			[ 'strips backticks and lowercases together', '`Option_Name`', 'option_name' ],
		] )( '%s', ( _name, identifier, expected ) => {
			expect( normalizeSqlIdentifier( identifier ) ).toBe( expected );
		} );
	} );

	describe( 'findValuesKeywordIndex', () => {
		it( 'returns the index of the VALUES keyword', () => {
			const line = 'INSERT INTO wp_options VALUES (1)';
			expect( findValuesKeywordIndex( line ) ).toBe( line.indexOf( 'VALUES' ) );
		} );

		it( 'returns the index of the VALUE keyword', () => {
			const line = 'INSERT INTO wp_options VALUE (1)';
			expect( findValuesKeywordIndex( line ) ).toBe( line.indexOf( 'VALUE' ) );
		} );

		it( 'returns -1 when VALUES is absent', () => {
			expect( findValuesKeywordIndex( 'INSERT INTO wp_options (option_name)' ) ).toBe( -1 );
		} );

		it( 'matches lowercase and mixed-case VALUE and VALUES', () => {
			expect( findValuesKeywordIndex( 'insert into wp_options value (1)' ) ).toBeGreaterThan( -1 );
			expect( findValuesKeywordIndex( 'INSERT INTO wp_options Value (1)' ) ).toBeGreaterThan( -1 );
			expect( findValuesKeywordIndex( 'insert into wp_options values (1)' ) ).toBeGreaterThan( -1 );
			expect( findValuesKeywordIndex( 'INSERT INTO wp_options Values (1)' ) ).toBeGreaterThan( -1 );
		} );

		it( 'enforces word boundaries and does not match substrings inside larger tokens', () => {
			expect( findValuesKeywordIndex( 'NOVALUES' ) ).toBe( -1 );
			expect( findValuesKeywordIndex( 'value_backup' ) ).toBe( -1 );
			expect( findValuesKeywordIndex( 'MYVALUE' ) ).toBe( -1 );
		} );

		it( 'does not match VALUE when adjacent to SQL identifier characters', () => {
			expect( findValuesKeywordIndex( 'aVALUE' ) ).toBe( -1 );
			expect( findValuesKeywordIndex( '1VALUE' ) ).toBe( -1 );
			expect( findValuesKeywordIndex( '_VALUE' ) ).toBe( -1 );
			expect( findValuesKeywordIndex( '$VALUE' ) ).toBe( -1 );
			expect( findValuesKeywordIndex( 'VALUEa' ) ).toBe( -1 );
			expect( findValuesKeywordIndex( 'VALUE1' ) ).toBe( -1 );
			expect( findValuesKeywordIndex( 'VALUE_backup' ) ).toBe( -1 );
			expect( findValuesKeywordIndex( 'VALUE$backup' ) ).toBe( -1 );
		} );

		it( 'matches standalone VALUE and VALUES with punctuation boundaries', () => {
			expect( findValuesKeywordIndex( '(VALUE)' ) ).toBe( 1 );
			expect( findValuesKeywordIndex( ',VALUES;' ) ).toBe( 1 );
		} );

		it( 'returns the real VALUES index after an earlier identifier false positive', () => {
			const line = 'value$db.wp_options VALUES (1)';
			expect( findValuesKeywordIndex( line ) ).toBe( line.indexOf( 'VALUES' ) );
		} );

		it( 'skips backtick identifiers and quoted strings before a real VALUES keyword', () => {
			const line = '`VALUES` "VALUE" VALUES (1)';
			expect( findValuesKeywordIndex( line ) ).toBe( line.lastIndexOf( 'VALUES' ) );
		} );
	} );

	describe( 'findValuesKeyword', () => {
		it.each( [
			[ 'returns keyword bounds for singular VALUE', 'INSERT INTO wp_options VALUE (1)', 'VALUE' ],
			[ 'returns keyword bounds for plural VALUES', 'INSERT INTO wp_options VALUES (1)', 'VALUES' ],
			[
				'returns undefined when VALUE(S) is absent',
				'INSERT INTO wp_options (option_name)',
				undefined,
			],
		] )( '%s', ( _name, line, keyword ) => {
			const result = findValuesKeyword( line );
			const expected =
				undefined === keyword
					? undefined
					: {
							index: line.indexOf( keyword ),
							endIndex: line.indexOf( keyword ) + keyword.length,
					  };
			expect( result ).toEqual( expected );
		} );
	} );

	describe( 'parseInsertColumnList', () => {
		it.each( [
			[
				'returns the lowercased column list following the table name',
				'INSERT INTO wp_options (option_name, option_value, autoload) VALUES (1,2,3)',
				[ 'option_name', 'option_value', 'autoload' ],
			],
			[
				'returns undefined when the opening parenthesis is after the VALUES keyword',
				'INSERT INTO wp_options VALUES (1, 2, 3)',
				undefined,
			],
			[
				'returns the lowercased column list before the VALUE keyword',
				'INSERT INTO wp_options (option_id, option_name, option_value, autoload) VALUE (1,2,3,4)',
				[ 'option_id', 'option_name', 'option_value', 'autoload' ],
			],
			[
				'returns undefined when the opening parenthesis is after the VALUE keyword',
				'INSERT INTO wp_options VALUE (1, 2, 3, 4)',
				undefined,
			],
			[
				'returns undefined when no opening parenthesis is between startIndex and VALUES',
				'INSERT INTO wp_options VALUES 1, 2, 3',
				undefined,
			],
			[
				'returns undefined when the column list opens but does not close on the same line',
				'INSERT INTO wp_options (option_name',
				undefined,
			],
			[
				'strips backticks from the column list',
				'INSERT INTO wp_options (`option_name`, `option_value`) VALUES (1,2)',
				[ 'option_name', 'option_value' ],
			],
			[
				'filters out empty entries produced by trailing commas',
				'INSERT INTO wp_options (option_name, option_value,) VALUES (1,2)',
				[ 'option_name', 'option_value' ],
			],
		] )( '%s', ( _name, line, expected ) => {
			const startIndex = line.indexOf( 'wp_options' ) + 'wp_options'.length;
			expect( parseInsertColumnList( line, startIndex ) ).toEqual( expected );
		} );
	} );

	describe( 'parseInsertColumnListSegment', () => {
		it.each( [
			[
				'parses a comma-separated segment into normalized columns',
				'option_name, option_value, autoload',
				[ 'option_name', 'option_value', 'autoload' ],
			],
			[
				'handles a multi-line column list with embedded newlines',
				'option_name,\noption_value,\nautoload',
				[ 'option_name', 'option_value', 'autoload' ],
			],
			[ 'returns undefined for empty input', '', undefined ],
			[
				'strips backticks and lowercases entries',
				'`Option_Name`, `Option_Value`',
				[ 'option_name', 'option_value' ],
			],
		] )( '%s', ( _name, input, expected ) => {
			expect( parseInsertColumnListSegment( input ) ).toEqual( expected );
		} );
	} );

	describe( 'isEscapedByBackslash', () => {
		it.each( [
			[ 'returns true when a single backslash immediately precedes the index', "\\'", 1, true ],
			[ 'returns false when two backslashes precede the index', "\\\\'", 2, false ],
			[ 'returns true when an odd run of backslashes precedes the index', "\\\\\\'", 3, true ],
			[ 'returns false when no backslash precedes the index', "abc'", 3, false ],
			[ 'returns false when index is 0 (no characters before it)', "'abc", 0, false ],
		] )( '%s', ( _name, input, index, expected ) => {
			expect( isEscapedByBackslash( input, index ) ).toBe( expected );
		} );
	} );

	describe( 'stripSqlCommentsOutsideQuotedStrings', () => {
		it( 'returns a plain line without comments unchanged', () => {
			expect( stripSqlCommentsOutsideQuotedStrings( 'foo bar' ) ).toBe( 'foo bar' );
		} );

		it( 'strips a -- line comment and trims trailing whitespace before it', () => {
			expect( stripSqlCommentsOutsideQuotedStrings( 'foo -- comment' ) ).toBe( 'foo' );
		} );

		it( 'strips a # line comment', () => {
			expect( stripSqlCommentsOutsideQuotedStrings( 'foo # comment' ) ).toBe( 'foo' );
		} );

		it( 'strips a /* ... */ block comment while preserving surrounding text', () => {
			const result = stripSqlCommentsOutsideQuotedStrings( 'foo /* block */ bar' );
			expect( result ).not.toContain( 'block' );
			expect( result ).toBe( 'foo  bar' );
		} );

		it( 'carries block-comment state across lines when a state object is provided', () => {
			const state = { inBlockComment: false };

			expect( stripSqlCommentsOutsideQuotedStrings( 'foo /* start', state ) ).toBe( 'foo' );
			expect( state ).toEqual( { inBlockComment: true } );

			expect(
				stripSqlCommentsOutsideQuotedStrings(
					"('siteurl', 'https://commented.example', 'yes'),",
					state
				)
			).toBe( '' );
			expect( state ).toEqual( { inBlockComment: true } );

			expect( stripSqlCommentsOutsideQuotedStrings( '*/ bar', state ) ).toBe( 'bar' );
			expect( state ).toEqual( { inBlockComment: false } );
		} );

		it( 'treats an unterminated /* as the start of a comment that runs to end of line', () => {
			expect( stripSqlCommentsOutsideQuotedStrings( 'foo /* unterminated' ) ).toBe( 'foo' );
		} );

		it( 'does not treat -- inside single-quoted strings as a comment', () => {
			const input = "'foo -- inside' bar";
			expect( stripSqlCommentsOutsideQuotedStrings( input ) ).toBe( input );
		} );

		it( 'does not treat block-comment markers inside single-quoted strings as comments', () => {
			const input = "'before /* inside */ after'";
			expect( stripSqlCommentsOutsideQuotedStrings( input ) ).toBe( input );
		} );

		it( 'does not treat # inside single-quoted strings as a comment', () => {
			const input = "'foo # inside' bar";
			expect( stripSqlCommentsOutsideQuotedStrings( input ) ).toBe( input );
		} );

		it( 'does not treat -- inside double-quoted strings as a comment', () => {
			const input = '"foo -- not a comment"';
			expect( stripSqlCommentsOutsideQuotedStrings( input ) ).toBe( input );
		} );

		it( 'does not treat block-comment markers inside double-quoted strings as comments', () => {
			const input = '"before /* inside */ after"';
			expect( stripSqlCommentsOutsideQuotedStrings( input ) ).toBe( input );
		} );

		it( "handles a doubled '' SQL quote escape inside a string", () => {
			const input = "'it''s'";
			expect( stripSqlCommentsOutsideQuotedStrings( input ) ).toBe( input );
		} );

		it( 'handles a backslash-escaped quote inside a string', () => {
			const input = "'it\\'s'";
			expect( stripSqlCommentsOutsideQuotedStrings( input ) ).toBe( input );
		} );

		it( 'does not treat -- without trailing whitespace or end-of-string as a comment', () => {
			expect( stripSqlCommentsOutsideQuotedStrings( 'foo--bar' ) ).toBe( 'foo--bar' );
		} );

		it( 'returns the empty string unchanged', () => {
			expect( stripSqlCommentsOutsideQuotedStrings( '' ) ).toBe( '' );
		} );
	} );

	describe( 'parseSqlTupleRows', () => {
		it.each( [
			[
				'parses a single tuple and keeps surrounding quotes on each value',
				"('a', 'b', 'c')",
				{ rows: [ [ "'a'", "'b'", "'c'" ] ], remainder: undefined },
			],
			[
				'parses multiple tuples on one line',
				"('a','b'),('c','d')",
				{
					rows: [
						[ "'a'", "'b'" ],
						[ "'c'", "'d'" ],
					],
					remainder: undefined,
				},
			],
			[
				'does not split a value at a quoted comma',
				"('a,b','c')",
				{ rows: [ [ "'a,b'", "'c'" ] ], remainder: undefined },
			],
			[
				'does not close a tuple at a quoted parenthesis',
				"('a)b','c')",
				{ rows: [ [ "'a)b'", "'c'" ] ], remainder: undefined },
			],
			[
				"handles a doubled '' quote escape inside a value",
				"('it''s','x')",
				{ rows: [ [ "'it''s'", "'x'" ] ], remainder: undefined },
			],
			[
				'handles a backslash-escaped quote inside a value',
				"('a\\'b','c')",
				{ rows: [ [ "'a\\'b'", "'c'" ] ], remainder: undefined },
			],
			[ 'returns empty rows for an empty input', '', { rows: [], remainder: undefined } ],
			[ 'returns empty rows for whitespace-only input', '   ', { rows: [], remainder: undefined } ],
			[
				'skips garbage before the first opening parenthesis',
				"... ('a','b')",
				{ rows: [ [ "'a'", "'b'" ] ], remainder: undefined },
			],
		] )( '%s', ( _name, input, expected ) => {
			expect( parseSqlTupleRows( input, 0 ) ).toEqual( expected );
		} );

		it( 'returns completed rows plus a remainder slice for an unterminated trailing tuple', () => {
			const line = "('a','b'),('c'";
			const result = parseSqlTupleRows( line, 0 );
			expect( result.rows ).toEqual( [ [ "'a'", "'b'" ] ] );
			expect( result.remainder ).toBe( line.slice( line.lastIndexOf( '(' ) ) );
		} );
	} );

	describe( 'unquoteSqlValue', () => {
		it.each( [
			[ 'unwraps a single-quoted value', "'foo'", 'foo' ],
			[ 'unwraps a double-quoted value', '"foo"', 'foo' ],
			[ 'passes through an unquoted bare value', 'foo', 'foo' ],
			[
				'returns the trimmed value (not unwrapped) when the surrounding quotes do not match',
				'\'foo"',
				'\'foo"',
			],
			[ "collapses doubled '' quote escapes inside a quoted value", "'it''s'", "it's" ],
			[ 'collapses backslash-escaped quotes inside a quoted value', "'it\\'s'", "it's" ],
			[ 'returns the empty string for undefined input', undefined, '' ],
			[ 'trims surrounding whitespace before unwrapping', "  'foo'  ", 'foo' ],
		] )( '%s', ( _name, input, expected ) => {
			expect( unquoteSqlValue( input ) ).toBe( expected );
		} );
	} );

	describe( 'getOptionUrlMatchResults', () => {
		it.each( [
			[
				'returns a siteurl match using the default columns and a full row',
				[ '1', "'siteurl'", "'https://example.com'", "'yes'" ],
				undefined,
				[ '', 'siteurl', 'https://example.com' ],
			],
			[
				'returns a home match using the default columns',
				[ '1', "'home'", "'https://example.com'", "'yes'" ],
				undefined,
				[ '', 'home', 'https://example.com' ],
			],
			[
				'returns undefined when option_name is unrelated',
				[ '1', "'blogdescription'", "'https://example.com'", "'yes'" ],
				undefined,
				undefined,
			],
			[
				'returns undefined when option_value is not a URL',
				[ '1', "'siteurl'", "'plain-text'", "'yes'" ],
				undefined,
				undefined,
			],
			[
				'matches an uppercase HTTPS scheme (case-insensitive)',
				[ '1', "'siteurl'", "'HTTPS://Example.com'", "'yes'" ],
				undefined,
				[ '', 'siteurl', 'HTTPS://Example.com' ],
			],
			[
				'honours an explicit reordered columns argument',
				[ "'https://reordered.example'", "'siteurl'", "'yes'" ],
				[ 'option_value', 'option_name', 'autoload' ],
				[ '', 'siteurl', 'https://reordered.example' ],
			],
			[
				'returns undefined when the columns array lacks option_name or option_value',
				[ "'siteurl'", "'https://example.com'" ],
				[ 'foo', 'bar' ],
				undefined,
			],
			[
				"passes a doubled '' quote escape through unquoting before the URL test",
				[ '1', "'siteurl'", "'https://it''s.example'", "'yes'" ],
				undefined,
				[ '', 'siteurl', "https://it's.example" ],
			],
		] )( '%s', ( _name, rows, columns, expected ) => {
			expect( getOptionUrlMatchResults( rows, columns ) ).toEqual( expected );
		} );
	} );
} );
