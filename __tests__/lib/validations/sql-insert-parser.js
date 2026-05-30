/**
 * @format
 */

import {
	DEFAULT_OPTIONS_INSERT_COLUMNS,
	INSERT_STATEMENT_MODIFIERS,
	checkRequiresOptionsInsertContext,
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
		it( 'returns startIndex when the current character is non-whitespace', () => {
			expect( skipSqlWhitespace( 'abc', 0 ) ).toBe( 0 );
			expect( skipSqlWhitespace( 'abc', 1 ) ).toBe( 1 );
		} );

		it( 'skips a run of plain spaces', () => {
			expect( skipSqlWhitespace( '   abc', 0 ) ).toBe( 3 );
		} );

		it( 'skips a run of mixed whitespace including tabs and newlines', () => {
			expect( skipSqlWhitespace( ' \t\n abc', 0 ) ).toBe( 4 );
		} );

		it( 'returns line.length when whitespace runs to end of string', () => {
			const line = '   \t\n';
			expect( skipSqlWhitespace( line, 0 ) ).toBe( line.length );
		} );

		it( 'returns startIndex when startIndex is at or past end of line', () => {
			expect( skipSqlWhitespace( 'abc', 3 ) ).toBe( 3 );
			expect( skipSqlWhitespace( 'abc', 10 ) ).toBe( 10 );
		} );
	} );

	describe( 'readSqlIdentifier', () => {
		it( 'returns undefined when only whitespace remains', () => {
			expect( readSqlIdentifier( '   ', 0 ) ).toBeUndefined();
		} );

		it( 'reads a bare identifier and returns endIndex past its last char', () => {
			expect( readSqlIdentifier( 'wp_options foo', 0 ) ).toEqual( {
				name: 'wp_options',
				endIndex: 10,
			} );
		} );

		it( 'reads a backtick-quoted identifier and returns endIndex past the closing backtick', () => {
			expect( readSqlIdentifier( '`my db`.tbl', 0 ) ).toEqual( {
				name: 'my db',
				endIndex: 7,
			} );
		} );

		it( 'returns undefined when an opening backtick is not closed', () => {
			expect( readSqlIdentifier( '`unterminated', 0 ) ).toBeUndefined();
		} );

		it( 'returns undefined when the next non-whitespace char is non-identifier punctuation', () => {
			expect( readSqlIdentifier( '(foo)', 0 ) ).toBeUndefined();
		} );

		it( 'skips leading whitespace before reading the identifier', () => {
			expect( readSqlIdentifier( '   wp_options', 0 ) ).toEqual( {
				name: 'wp_options',
				endIndex: 13,
			} );
		} );
	} );

	describe( 'getInsertStatementInfo', () => {
		it( 'returns undefined for non-INSERT lines', () => {
			expect( getInsertStatementInfo( 'SELECT * FROM wp_options' ) ).toBeUndefined();
		} );

		it( 'recognizes a plain INSERT INTO statement', () => {
			const line = 'INSERT INTO wp_options (option_name) VALUES ("home")';
			expect( getInsertStatementInfo( line ) ).toEqual( {
				tableName: 'wp_options',
				tableEndIndex: 'INSERT INTO wp_options'.length,
			} );
		} );

		it( 'recognizes REPLACE INTO statements', () => {
			const line = 'REPLACE INTO wp_options (option_name) VALUES ("home")';
			expect( getInsertStatementInfo( line ) ).toEqual( {
				tableName: 'wp_options',
				tableEndIndex: 'REPLACE INTO wp_options'.length,
			} );
		} );

		it( 'skips a single modifier before INTO', () => {
			const result = getInsertStatementInfo(
				'INSERT IGNORE INTO wp_options (option_name) VALUES ("home")'
			);
			expect( result?.tableName ).toBe( 'wp_options' );
		} );

		it( 'skips chained modifiers before INTO', () => {
			const result = getInsertStatementInfo(
				'INSERT LOW_PRIORITY IGNORE INTO wp_options (option_name) VALUES ("home")'
			);
			expect( result?.tableName ).toBe( 'wp_options' );
		} );

		it( 'recognizes DELAYED and HIGH_PRIORITY modifiers', () => {
			expect(
				getInsertStatementInfo( 'INSERT DELAYED INTO wp_options VALUES ("home")' )?.tableName
			).toBe( 'wp_options' );
			expect(
				getInsertStatementInfo( 'INSERT HIGH_PRIORITY INTO wp_options VALUES ("home")' )?.tableName
			).toBe( 'wp_options' );
		} );

		it( 'handles missing INTO keyword by treating the next identifier as the table', () => {
			const line = 'INSERT wp_options VALUES ("home")';
			expect( getInsertStatementInfo( line ) ).toEqual( {
				tableName: 'wp_options',
				tableEndIndex: 17,
			} );
		} );

		it( 'resolves a qualified db.table reference to the table identifier', () => {
			const result = getInsertStatementInfo(
				'INSERT INTO db.wp_options (option_name) VALUES ("home")'
			);
			expect( result?.tableName ).toBe( 'wp_options' );
		} );

		it( 'resolves a backtick-qualified `db`.`table` reference to the table identifier', () => {
			const result = getInsertStatementInfo(
				'INSERT INTO `db`.`wp_options` (option_name) VALUES ("home")'
			);
			expect( result?.tableName ).toBe( 'wp_options' );
		} );

		it( 'returns table info when the line ends right after the table name', () => {
			const line = 'INSERT INTO wp_options';
			expect( getInsertStatementInfo( line ) ).toEqual( {
				tableName: 'wp_options',
				tableEndIndex: line.length,
			} );
		} );

		it( 'is case-insensitive on the INSERT INTO keywords', () => {
			expect(
				getInsertStatementInfo( 'insert into wp_options (option_name) VALUES ("home")' )?.tableName
			).toBe( 'wp_options' );
		} );
	} );

	describe( 'isWordPressOptionsTable', () => {
		it( 'returns true for the canonical wp_options table', () => {
			expect( isWordPressOptionsTable( 'wp_options' ) ).toBe( true );
		} );

		it( 'is case-insensitive on the table name', () => {
			expect( isWordPressOptionsTable( 'WP_Options' ) ).toBe( true );
		} );

		it( 'returns true for multisite wp_<id>_options variants', () => {
			expect( isWordPressOptionsTable( 'wp_2_options' ) ).toBe( true );
			expect( isWordPressOptionsTable( 'wp_12_options' ) ).toBe( true );
		} );

		it( 'returns false when the site id segment is empty', () => {
			expect( isWordPressOptionsTable( 'wp__options' ) ).toBe( false );
		} );

		it( 'returns false when the site id segment is non-numeric', () => {
			expect( isWordPressOptionsTable( 'wp_a_options' ) ).toBe( false );
		} );

		it( 'returns false when the site id segment mixes letters and digits', () => {
			expect( isWordPressOptionsTable( 'wp_2a_options' ) ).toBe( false );
		} );

		it( 'returns false for unrelated wp_ tables', () => {
			expect( isWordPressOptionsTable( 'wp_posts' ) ).toBe( false );
		} );

		it( 'returns false for an unprefixed options table', () => {
			expect( isWordPressOptionsTable( 'options' ) ).toBe( false );
		} );

		it( 'returns false for an undefined table name', () => {
			expect( isWordPressOptionsTable( undefined ) ).toBe( false );
		} );
	} );

	describe( 'checkRequiresOptionsInsertContext', () => {
		it( 'returns true for siteHomeUrl', () => {
			expect( checkRequiresOptionsInsertContext( 'siteHomeUrl' ) ).toBe( true );
		} );

		it( 'returns true for siteHomeUrlLando', () => {
			expect( checkRequiresOptionsInsertContext( 'siteHomeUrlLando' ) ).toBe( true );
		} );

		it( 'returns false for unrelated check keys', () => {
			expect( checkRequiresOptionsInsertContext( 'binaryLogging' ) ).toBe( false );
		} );

		it( 'returns false for the empty string', () => {
			expect( checkRequiresOptionsInsertContext( '' ) ).toBe( false );
		} );
	} );

	describe( 'normalizeSqlIdentifier', () => {
		it( 'returns a bare lowercase identifier unchanged', () => {
			expect( normalizeSqlIdentifier( 'option_name' ) ).toBe( 'option_name' );
		} );

		it( 'strips surrounding backticks', () => {
			expect( normalizeSqlIdentifier( '`option_name`' ) ).toBe( 'option_name' );
		} );

		it( 'lowercases uppercase identifiers', () => {
			expect( normalizeSqlIdentifier( 'OPTION_NAME' ) ).toBe( 'option_name' );
		} );

		it( 'strips backticks and lowercases together', () => {
			expect( normalizeSqlIdentifier( '`Option_Name`' ) ).toBe( 'option_name' );
		} );
	} );

	describe( 'findValuesKeywordIndex', () => {
		it( 'returns the index of the VALUES keyword', () => {
			const line = 'INSERT INTO wp_options VALUES (1)';
			expect( findValuesKeywordIndex( line ) ).toBe( line.indexOf( 'VALUES' ) );
		} );

		it( 'returns -1 when VALUES is absent', () => {
			expect( findValuesKeywordIndex( 'INSERT INTO wp_options (option_name)' ) ).toBe( -1 );
		} );

		it( 'matches lowercase and mixed-case VALUES', () => {
			expect( findValuesKeywordIndex( 'insert into wp_options values (1)' ) ).toBeGreaterThan( -1 );
			expect( findValuesKeywordIndex( 'INSERT INTO wp_options Values (1)' ) ).toBeGreaterThan( -1 );
		} );

		it( 'enforces word boundaries and does not match substrings like MYVALUES', () => {
			expect( findValuesKeywordIndex( 'NOVALUES' ) ).toBe( -1 );
		} );
	} );

	describe( 'parseInsertColumnList', () => {
		it( 'returns the lowercased column list following the table name', () => {
			const line = 'INSERT INTO wp_options (option_name, option_value, autoload) VALUES (1,2,3)';
			const startIndex = line.indexOf( 'wp_options' ) + 'wp_options'.length;
			expect( parseInsertColumnList( line, startIndex ) ).toEqual( [
				'option_name',
				'option_value',
				'autoload',
			] );
		} );

		it( 'returns undefined when the opening parenthesis is after the VALUES keyword', () => {
			const line = 'INSERT INTO wp_options VALUES (1, 2, 3)';
			const startIndex = line.indexOf( 'wp_options' ) + 'wp_options'.length;
			expect( parseInsertColumnList( line, startIndex ) ).toBeUndefined();
		} );

		it( 'returns undefined when no opening parenthesis is between startIndex and VALUES', () => {
			const line = 'INSERT INTO wp_options VALUES 1, 2, 3';
			const startIndex = line.indexOf( 'wp_options' ) + 'wp_options'.length;
			expect( parseInsertColumnList( line, startIndex ) ).toBeUndefined();
		} );

		it( 'returns undefined when the column list opens but does not close on the same line', () => {
			const line = 'INSERT INTO wp_options (option_name';
			const startIndex = line.indexOf( 'wp_options' ) + 'wp_options'.length;
			expect( parseInsertColumnList( line, startIndex ) ).toBeUndefined();
		} );

		it( 'strips backticks from the column list', () => {
			const line = 'INSERT INTO wp_options (`option_name`, `option_value`) VALUES (1,2)';
			const startIndex = line.indexOf( 'wp_options' ) + 'wp_options'.length;
			expect( parseInsertColumnList( line, startIndex ) ).toEqual( [
				'option_name',
				'option_value',
			] );
		} );

		it( 'filters out empty entries produced by trailing commas', () => {
			const line = 'INSERT INTO wp_options (option_name, option_value,) VALUES (1,2)';
			const startIndex = line.indexOf( 'wp_options' ) + 'wp_options'.length;
			expect( parseInsertColumnList( line, startIndex ) ).toEqual( [
				'option_name',
				'option_value',
			] );
		} );
	} );

	describe( 'parseInsertColumnListSegment', () => {
		it( 'parses a comma-separated segment into normalized columns', () => {
			expect( parseInsertColumnListSegment( 'option_name, option_value, autoload' ) ).toEqual( [
				'option_name',
				'option_value',
				'autoload',
			] );
		} );

		it( 'handles a multi-line column list with embedded newlines', () => {
			expect( parseInsertColumnListSegment( 'option_name,\noption_value,\nautoload' ) ).toEqual( [
				'option_name',
				'option_value',
				'autoload',
			] );
		} );

		it( 'returns undefined for empty input', () => {
			expect( parseInsertColumnListSegment( '' ) ).toBeUndefined();
		} );

		it( 'strips backticks and lowercases entries', () => {
			expect( parseInsertColumnListSegment( '`Option_Name`, `Option_Value`' ) ).toEqual( [
				'option_name',
				'option_value',
			] );
		} );
	} );

	describe( 'isEscapedByBackslash', () => {
		it( 'returns true when a single backslash immediately precedes the index', () => {
			expect( isEscapedByBackslash( "\\'", 1 ) ).toBe( true );
		} );

		it( 'returns false when two backslashes precede the index', () => {
			expect( isEscapedByBackslash( "\\\\'", 2 ) ).toBe( false );
		} );

		it( 'returns true when an odd run of backslashes precedes the index', () => {
			expect( isEscapedByBackslash( "\\\\\\'", 3 ) ).toBe( true );
		} );

		it( 'returns false when no backslash precedes the index', () => {
			expect( isEscapedByBackslash( "abc'", 3 ) ).toBe( false );
		} );

		it( 'returns false when index is 0 (no characters before it)', () => {
			expect( isEscapedByBackslash( "'abc", 0 ) ).toBe( false );
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

		it( 'does not treat -- inside double-quoted strings as a comment', () => {
			const input = '"foo -- not a comment"';
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
		it( 'parses a single tuple and keeps surrounding quotes on each value', () => {
			expect( parseSqlTupleRows( "('a', 'b', 'c')", 0 ) ).toEqual( {
				rows: [ [ "'a'", "'b'", "'c'" ] ],
				remainder: undefined,
			} );
		} );

		it( 'parses multiple tuples on one line', () => {
			expect( parseSqlTupleRows( "('a','b'),('c','d')", 0 ) ).toEqual( {
				rows: [
					[ "'a'", "'b'" ],
					[ "'c'", "'d'" ],
				],
				remainder: undefined,
			} );
		} );

		it( 'returns completed rows plus a remainder slice for an unterminated trailing tuple', () => {
			const line = "('a','b'),('c'";
			const result = parseSqlTupleRows( line, 0 );
			expect( result.rows ).toEqual( [ [ "'a'", "'b'" ] ] );
			expect( result.remainder ).toBe( line.slice( line.lastIndexOf( '(' ) ) );
		} );

		it( 'does not split a value at a quoted comma', () => {
			expect( parseSqlTupleRows( "('a,b','c')", 0 ) ).toEqual( {
				rows: [ [ "'a,b'", "'c'" ] ],
				remainder: undefined,
			} );
		} );

		it( 'does not close a tuple at a quoted parenthesis', () => {
			expect( parseSqlTupleRows( "('a)b','c')", 0 ) ).toEqual( {
				rows: [ [ "'a)b'", "'c'" ] ],
				remainder: undefined,
			} );
		} );

		it( "handles a doubled '' quote escape inside a value", () => {
			expect( parseSqlTupleRows( "('it''s','x')", 0 ) ).toEqual( {
				rows: [ [ "'it''s'", "'x'" ] ],
				remainder: undefined,
			} );
		} );

		it( 'handles a backslash-escaped quote inside a value', () => {
			expect( parseSqlTupleRows( "('a\\'b','c')", 0 ) ).toEqual( {
				rows: [ [ "'a\\'b'", "'c'" ] ],
				remainder: undefined,
			} );
		} );

		it( 'returns empty rows for an empty input', () => {
			expect( parseSqlTupleRows( '', 0 ) ).toEqual( { rows: [], remainder: undefined } );
		} );

		it( 'returns empty rows for whitespace-only input', () => {
			expect( parseSqlTupleRows( '   ', 0 ) ).toEqual( { rows: [], remainder: undefined } );
		} );

		it( 'skips garbage before the first opening parenthesis', () => {
			expect( parseSqlTupleRows( "... ('a','b')", 0 ) ).toEqual( {
				rows: [ [ "'a'", "'b'" ] ],
				remainder: undefined,
			} );
		} );
	} );

	describe( 'unquoteSqlValue', () => {
		it( 'unwraps a single-quoted value', () => {
			expect( unquoteSqlValue( "'foo'" ) ).toBe( 'foo' );
		} );

		it( 'unwraps a double-quoted value', () => {
			expect( unquoteSqlValue( '"foo"' ) ).toBe( 'foo' );
		} );

		it( 'passes through an unquoted bare value', () => {
			expect( unquoteSqlValue( 'foo' ) ).toBe( 'foo' );
		} );

		it( 'returns the trimmed value (not unwrapped) when the surrounding quotes do not match', () => {
			expect( unquoteSqlValue( '\'foo"' ) ).toBe( '\'foo"' );
		} );

		it( "collapses doubled '' quote escapes inside a quoted value", () => {
			expect( unquoteSqlValue( "'it''s'" ) ).toBe( "it's" );
		} );

		it( 'collapses backslash-escaped quotes inside a quoted value', () => {
			expect( unquoteSqlValue( "'it\\'s'" ) ).toBe( "it's" );
		} );

		it( 'returns the empty string for undefined input', () => {
			expect( unquoteSqlValue( undefined ) ).toBe( '' );
		} );

		it( 'trims surrounding whitespace before unwrapping', () => {
			expect( unquoteSqlValue( "  'foo'  " ) ).toBe( 'foo' );
		} );
	} );

	describe( 'getOptionUrlMatchResults', () => {
		it( 'returns a siteurl match using the default columns and a full row', () => {
			expect(
				getOptionUrlMatchResults( [ '1', "'siteurl'", "'https://example.com'", "'yes'" ] )
			).toEqual( [ '', 'siteurl', 'https://example.com' ] );
		} );

		it( 'returns a home match using the default columns', () => {
			expect(
				getOptionUrlMatchResults( [ '1', "'home'", "'https://example.com'", "'yes'" ] )
			).toEqual( [ '', 'home', 'https://example.com' ] );
		} );

		it( 'returns undefined when option_name is unrelated', () => {
			expect(
				getOptionUrlMatchResults( [ '1', "'blogdescription'", "'https://example.com'", "'yes'" ] )
			).toBeUndefined();
		} );

		it( 'returns undefined when option_value is not a URL', () => {
			expect(
				getOptionUrlMatchResults( [ '1', "'siteurl'", "'plain-text'", "'yes'" ] )
			).toBeUndefined();
		} );

		it( 'matches an uppercase HTTPS scheme (case-insensitive)', () => {
			expect(
				getOptionUrlMatchResults( [ '1', "'siteurl'", "'HTTPS://Example.com'", "'yes'" ] )
			).toEqual( [ '', 'siteurl', 'HTTPS://Example.com' ] );
		} );

		it( 'honours an explicit reordered columns argument', () => {
			expect(
				getOptionUrlMatchResults(
					[ "'https://reordered.example'", "'siteurl'", "'yes'" ],
					[ 'option_value', 'option_name', 'autoload' ]
				)
			).toEqual( [ '', 'siteurl', 'https://reordered.example' ] );
		} );

		it( 'returns undefined when the columns array lacks option_name or option_value', () => {
			expect(
				getOptionUrlMatchResults( [ "'siteurl'", "'https://example.com'" ], [ 'foo', 'bar' ] )
			).toBeUndefined();
		} );

		it( "passes a doubled '' quote escape through unquoting before the URL test", () => {
			expect(
				getOptionUrlMatchResults( [ '1', "'siteurl'", "'https://it''s.example'", "'yes'" ] )
			).toEqual( [ '', 'siteurl', "https://it's.example" ] );
		} );
	} );
} );
