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

	const matches = /^[a-z0-9_$]+/i.exec( line.slice( index ) );
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

export const findValuesKeywordIndex = ( line: string ): number => {
	const valuesMatches = /\bVALUES\b/i.exec( line );
	return valuesMatches?.index ?? -1;
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

export const stripSqlCommentsOutsideQuotedStrings = ( line: string ): string => {
	let uncommentedLine = '';
	let quote: string | undefined;

	for ( let index = 0; index < line.length; index += 1 ) {
		const char = line[ index ];

		if ( quote ) {
			uncommentedLine += char;

			if ( char === quote ) {
				if ( line[ index + 1 ] === quote ) {
					uncommentedLine += line[ index + 1 ];
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
			uncommentedLine += char;
			continue;
		}

		if ( '-' === char && '-' === line[ index + 1 ] ) {
			const nextChar = line[ index + 2 ];
			if ( undefined === nextChar || /\s/.test( nextChar ) ) {
				return uncommentedLine.trimEnd();
			}
		}

		if ( '#' === char ) {
			return uncommentedLine.trimEnd();
		}

		if ( '/' === char && '*' === line[ index + 1 ] ) {
			const blockCommentEndIndex = line.indexOf( '*/', index + 2 );
			if ( -1 === blockCommentEndIndex ) {
				return uncommentedLine.trimEnd();
			}

			index = blockCommentEndIndex + 1;
			continue;
		}

		uncommentedLine += char;
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
