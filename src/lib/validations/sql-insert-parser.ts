export const INSERT_STATEMENT_MODIFIERS = new Set( [
	'IGNORE',
	'LOW_PRIORITY',
	'DELAYED',
	'HIGH_PRIORITY',
] );

export interface SqlIdentifier {
	name: string;
	endIndex: number;
}

export interface InsertStatementInfo {
	tableName: string;
	tableEndIndex: number;
}

export interface SqlValuesKeywordMatch {
	index: number;
	endIndex: number;
}

const SQL_IDENTIFIER_REGEX = /^[a-z0-9_$]+/i;
const SQL_IDENTIFIER_CHAR_REGEX = /^[a-z0-9_$]$/i;
const VALUES_KEYWORD_REGEX = /^VALUES?/i;

export const DEFAULT_OPTIONS_INSERT_COLUMNS = [
	'option_id',
	'option_name',
	'option_value',
	'autoload',
];

export const skipSqlWhitespace = ( line: string, startIndex: number ): number => {
	let index = startIndex;
	while ( index < line.length && /\s/.test( line[ index ] ) ) {
		index += 1;
	}
	return index;
};

export const readSqlIdentifier = (
	line: string,
	startIndex: number
): SqlIdentifier | undefined => {
	const index = skipSqlWhitespace( line, startIndex );
	if ( index >= line.length ) {
		return undefined;
	}

	if ( '`' === line[ index ] ) {
		const endIndex = line.indexOf( '`', index + 1 );
		if ( -1 === endIndex ) {
			return undefined;
		}
		return { name: line.slice( index + 1, endIndex ), endIndex: endIndex + 1 };
	}

	const matches = SQL_IDENTIFIER_REGEX.exec( line.slice( index ) );
	if ( ! matches ) {
		return undefined;
	}

	return { name: matches[ 0 ], endIndex: index + matches[ 0 ].length };
};

export const getInsertStatementInfo = ( line: string ): InsertStatementInfo | undefined => {
	const statementMatches = /^\s*(?:INSERT|REPLACE)\b/i.exec( line );
	if ( ! statementMatches ) {
		return undefined;
	}

	let index = statementMatches[ 0 ].length;
	let tableName: SqlIdentifier | undefined;

	while ( true ) {
		const identifier = readSqlIdentifier( line, index );
		if ( ! identifier ) {
			return undefined;
		}

		const keyword = identifier.name.toUpperCase();
		index = identifier.endIndex;

		if ( INSERT_STATEMENT_MODIFIERS.has( keyword ) || 'INTO' === keyword ) {
			continue;
		}

		tableName = identifier;
		break;
	}

	const dotIndex = skipSqlWhitespace( line, tableName.endIndex );
	if ( '.' !== line[ dotIndex ] ) {
		return { tableName: tableName.name, tableEndIndex: tableName.endIndex };
	}

	const qualifiedTableName = readSqlIdentifier( line, dotIndex + 1 );
	return {
		tableName: qualifiedTableName?.name ?? tableName.name,
		tableEndIndex: qualifiedTableName?.endIndex ?? tableName.endIndex,
	};
};

export const isWordPressOptionsTable = ( tableName: string | undefined ): boolean => {
	const normalizedTableName = tableName?.toLowerCase() ?? '';
	if ( 'wp_options' === normalizedTableName ) {
		return true;
	}

	if ( ! normalizedTableName.startsWith( 'wp_' ) || ! normalizedTableName.endsWith( '_options' ) ) {
		return false;
	}

	const tableId = normalizedTableName.slice( 'wp_'.length, -'_options'.length );
	return tableId.length > 0 && [ ...tableId ].every( char => char >= '0' && char <= '9' );
};

export const checkRequiresOptionsInsertContext = ( checkKey: string ): boolean => {
	return 'siteHomeUrl' === checkKey || 'siteHomeUrlLando' === checkKey;
};

export const normalizeSqlIdentifier = ( identifier: string ): string => {
	return identifier.replace( /^`|`$/g, '' ).toLowerCase();
};

const isSqlIdentifierChar = ( char: string | undefined ): boolean => {
	return undefined !== char && SQL_IDENTIFIER_CHAR_REGEX.test( char );
};

export const findValuesKeyword = ( line: string ): SqlValuesKeywordMatch | undefined => {
	let quote: string | undefined;
	let inBacktickIdentifier = false;

	for ( let index = 0; index < line.length; index += 1 ) {
		const char = line[ index ];
		const nextChar = line[ index + 1 ];

		if ( inBacktickIdentifier ) {
			if ( '`' === char ) {
				if ( '`' === nextChar ) {
					index += 1;
					continue;
				}

				inBacktickIdentifier = false;
			}

			continue;
		}

		if ( quote ) {
			if ( char === quote ) {
				if ( nextChar === quote ) {
					index += 1;
					continue;
				}

				if ( ! isEscapedByBackslash( line, index ) ) {
					quote = undefined;
				}
			}

			continue;
		}

		if ( '`' === char ) {
			inBacktickIdentifier = true;
			continue;
		}

		if ( "'" === char || '"' === char ) {
			quote = char;
			continue;
		}

		const valuesMatches = VALUES_KEYWORD_REGEX.exec( line.slice( index ) );
		if ( ! valuesMatches ) {
			continue;
		}

		const endIndex = index + valuesMatches[ 0 ].length;
		if ( isSqlIdentifierChar( line[ index - 1 ] ) || isSqlIdentifierChar( line[ endIndex ] ) ) {
			index = endIndex - 1;
			continue;
		}

		return {
			index,
			endIndex,
		};
	}

	return undefined;
};

export const findValuesKeywordIndex = ( line: string ): number => {
	return findValuesKeyword( line )?.index ?? -1;
};

export const parseInsertColumnList = ( line: string, startIndex: number ): string[] | undefined => {
	const valuesIndex = findValuesKeywordIndex( line );
	const openingParenthesisIndex = line.indexOf( '(', startIndex );
	if (
		-1 === openingParenthesisIndex ||
		( -1 !== valuesIndex && openingParenthesisIndex > valuesIndex )
	) {
		return undefined;
	}

	const closingParenthesisIndex = line.indexOf( ')', openingParenthesisIndex + 1 );
	if ( -1 === closingParenthesisIndex ) {
		return undefined;
	}

	const columns = line
		.slice( openingParenthesisIndex + 1, closingParenthesisIndex )
		.split( ',' )
		.map( column => normalizeSqlIdentifier( column.trim() ) )
		.filter( Boolean );

	return columns.length > 0 ? columns : undefined;
};

export const parseInsertColumnListSegment = ( columnList: string ): string[] | undefined => {
	const columns = columnList
		.split( ',' )
		.map( column => normalizeSqlIdentifier( column.trim() ) )
		.filter( Boolean );

	return columns.length > 0 ? columns : undefined;
};

export const isEscapedByBackslash = ( line: string, index: number ): boolean => {
	let backslashCount = 0;
	let currentIndex = index - 1;
	while ( currentIndex >= 0 && '\\' === line[ currentIndex ] ) {
		backslashCount += 1;
		currentIndex -= 1;
	}

	return 1 === backslashCount % 2;
};

export interface SqlTupleRowsParseResult {
	rows: string[][];
	remainder?: string;
}

export interface SqlCommentStripState {
	inBlockComment: boolean;
}

const isSqlQuoteStart = ( char: string ): boolean => "'" === char || '"' === char;

const isSqlBlockCommentStart = ( line: string, index: number ): boolean =>
	'/' === line[ index ] && '*' === line[ index + 1 ];

const isSqlBlockCommentEnd = ( line: string, index: number ): boolean =>
	'*' === line[ index ] && '/' === line[ index + 1 ];

const isSqlDashCommentStart = ( line: string, index: number ): boolean => {
	if ( '-' !== line[ index ] || '-' !== line[ index + 1 ] ) {
		return false;
	}

	const afterCommentMarker = line[ index + 2 ];
	return undefined === afterCommentMarker || /\s/.test( afterCommentMarker );
};

const setSqlCommentStripState = (
	state: SqlCommentStripState | undefined,
	inBlockComment: boolean
): void => {
	if ( state ) {
		state.inBlockComment = inBlockComment;
	}
};

export const stripSqlCommentsOutsideQuotedStrings = (
	line: string,
	state?: SqlCommentStripState
): string => {
	let uncommentedLine = '';
	let quote: string | undefined;
	let inBlockComment = state?.inBlockComment ?? false;

	let index = 0;
	while ( index < line.length ) {
		const char = line[ index ];
		const nextChar = line[ index + 1 ];

		if ( inBlockComment ) {
			if ( isSqlBlockCommentEnd( line, index ) ) {
				inBlockComment = false;
				setSqlCommentStripState( state, false );
				index += 2;
				if ( '' === uncommentedLine ) {
					index = skipSqlWhitespace( line, index );
				}
				continue;
			}

			index += 1;
			continue;
		}

		if ( quote ) {
			uncommentedLine += char;

			if ( char === quote ) {
				if ( nextChar === quote ) {
					uncommentedLine += nextChar;
					index += 2;
					continue;
				}

				if ( ! isEscapedByBackslash( line, index ) ) {
					quote = undefined;
				}
			}

			index += 1;
			continue;
		}

		if ( isSqlQuoteStart( char ) ) {
			quote = char;
			uncommentedLine += char;
			index += 1;
			continue;
		}

		if ( isSqlDashCommentStart( line, index ) ) {
			return uncommentedLine.trimEnd();
		}

		if ( '#' === char ) {
			return uncommentedLine.trimEnd();
		}

		if ( isSqlBlockCommentStart( line, index ) ) {
			inBlockComment = true;
			setSqlCommentStripState( state, true );
			index += 2;
			continue;
		}

		uncommentedLine += char;
		index += 1;
	}

	if ( inBlockComment ) {
		return uncommentedLine.trimEnd();
	}

	return uncommentedLine;
};

export const parseSqlTupleRows = ( line: string, startIndex: number ): SqlTupleRowsParseResult => {
	const rows: string[][] = [];
	let currentRow: string[] | undefined;
	let currentValue = '';
	let parenthesisDepth = 0;
	let quote: string | undefined;
	let rowStartIndex: number | undefined;

	for ( let index = startIndex; index < line.length; index += 1 ) {
		const char = line[ index ];

		if ( quote ) {
			currentValue += char;

			if ( char === quote ) {
				if ( line[ index + 1 ] === quote ) {
					currentValue += line[ index + 1 ];
					index += 1;
					continue;
				}

				if ( ! isEscapedByBackslash( line, index ) ) {
					quote = undefined;
				}
			}

			continue;
		}

		if ( "'" === char || '"' === char ) {
			quote = char;
			currentValue += char;
			continue;
		}

		if ( '(' === char ) {
			if ( 0 === parenthesisDepth ) {
				currentRow = [];
				currentValue = '';
				rowStartIndex = index;
			} else {
				currentValue += char;
			}

			parenthesisDepth += 1;
			continue;
		}

		if ( ')' === char && currentRow ) {
			parenthesisDepth -= 1;

			if ( 0 === parenthesisDepth ) {
				currentRow.push( currentValue.trim() );
				rows.push( currentRow );
				currentRow = undefined;
				currentValue = '';
				rowStartIndex = undefined;
				continue;
			}
		}

		if ( ',' === char && 1 === parenthesisDepth && currentRow ) {
			currentRow.push( currentValue.trim() );
			currentValue = '';
			continue;
		}

		if ( currentRow ) {
			currentValue += char;
		}
	}

	return {
		rows,
		remainder: undefined === rowStartIndex ? undefined : line.slice( rowStartIndex ),
	};
};

export const unquoteSqlValue = ( value: string | undefined ): string => {
	const trimmedValue = value?.trim() ?? '';
	const quote = trimmedValue[ 0 ];
	if ( ! quote || ( "'" !== quote && '"' !== quote ) || trimmedValue.at( -1 ) !== quote ) {
		return trimmedValue;
	}

	return trimmedValue
		.slice( 1, -1 )
		.replaceAll( quote + quote, quote )
		.replaceAll( '\\' + quote, quote );
};

export const getOptionUrlMatchResults = (
	row: string[],
	columns?: string[]
): string[] | undefined => {
	const optionColumns = columns ?? DEFAULT_OPTIONS_INSERT_COLUMNS;
	const optionNameIndex = optionColumns.indexOf( 'option_name' );
	const optionValueIndex = optionColumns.indexOf( 'option_value' );

	if ( -1 === optionNameIndex || -1 === optionValueIndex ) {
		return undefined;
	}

	const optionName = unquoteSqlValue( row[ optionNameIndex ] ).toLowerCase();
	const optionValue = unquoteSqlValue( row[ optionValueIndex ] );

	if ( 'siteurl' !== optionName && 'home' !== optionName ) {
		return undefined;
	}

	if ( ! /^https?:\/\//i.test( optionValue ) ) {
		return undefined;
	}

	return [ '', optionName, optionValue ];
};
