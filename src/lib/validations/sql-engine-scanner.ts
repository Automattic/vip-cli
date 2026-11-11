const ALTER_TABLE_OPTIONS = new Set( [
	'AUTO_INCREMENT',
	'AUTOEXTEND_SIZE',
	'AVG_ROW_LENGTH',
	'CHARACTER',
	'CHARSET',
	'CHECKSUM',
	'COLLATE',
	'COMMENT',
	'COMPRESSION',
	'CONNECTION',
	'DATA',
	'DEFAULT',
	'DELAY_KEY_WRITE',
	'ENCRYPTION',
	'ENGINE',
	'ENGINE_ATTRIBUTE',
	'INDEX',
	'INSERT_METHOD',
	'KEY_BLOCK_SIZE',
	'MAX_ROWS',
	'MIN_ROWS',
	'PACK_KEYS',
	'PASSWORD',
	'ROW_FORMAT',
	'SECONDARY_ENGINE_ATTRIBUTE',
	'STATS_AUTO_RECALC',
	'STATS_PERSISTENT',
	'STATS_SAMPLE_PAGES',
	'TABLESPACE',
	'UNION',
] );
const isOptionValuePrefix = ( word: string ): boolean =>
	'=' === word || 'SET' === word || ( 'ENGINE' !== word && ALTER_TABLE_OPTIONS.has( word ) );

// A streaming scanner for CREATE/ALTER TABLE engine options. It never retains
// row data; quoted text and comments can cross physical lines.
export class SqlEngineScanner {
	private phase:
		| 'start'
		| 'create'
		| 'create-or'
		| 'create-replace'
		| 'temporary'
		| 'alter'
		| 'set'
		| 'create-table'
		| 'alter-table'
		| 'other' = 'start';
	private quote = '';
	private quotedValue = '';
	private block = false;
	private executable = false;
	private depth = 0;
	private sawCreateBody = false;
	private createStage: 'table' | 'if-not' | 'if-exists' | 'after-name' | 'qualified' | 'options' =
		'table';
	private createPrevious = '';
	private alterStage: 'table' | 'if-exists' | 'after-name' | 'qualified' | 'actions' = 'table';
	private alterCanEngine = false;
	private alterInOptions = false;
	private alterInOrder = false;
	private alterPrevious = '';
	private engineOrderCandidate = false;
	private engineLine = 0;
	private engineEquals = false;
	private noBackslashEscapes = false;
	private ansiQuotes = false;
	private sqlModeValueHasAnsi = false;
	private delimiter = ';';
	private started = false;
	private partitionClause = false;
	private partitionDefinitionDepth = 0;
	private partitionPrevious = '';
	private sqlModeAssignment = false;
	private setAtCount = 0;
	private setGlobalScope = false;
	private sqlModeSegment = '';
	private sqlModeSegmentLong = false;
	private sqlModeValueHasMode = false;

	private resetStatement(): void {
		this.phase = 'start';
		this.depth = 0;
		this.sawCreateBody = false;
		this.createStage = 'table';
		this.createPrevious = '';
		this.alterStage = 'table';
		this.alterCanEngine = false;
		this.alterInOptions = false;
		this.alterInOrder = false;
		this.alterPrevious = '';
		this.engineOrderCandidate = false;
		this.engineLine = 0;
		this.engineEquals = false;
		this.sqlModeAssignment = false;
		this.setAtCount = 0;
		this.setGlobalScope = false;
		this.partitionClause = false;
		this.partitionDefinitionDepth = 0;
		this.partitionPrevious = '';
	}

	// Tokens are dispatched by statement phase; each handler owns one grammar boundary.
	private token( text: string, line: number, findings: number[], quoted = false ): void {
		const upper = text.toUpperCase();
		if ( this.engineLine && this.engineValueToken( text, upper, findings, quoted ) ) {
			return;
		}
		if ( ';' === text && ! quoted ) {
			this.resetStatement();
			return;
		}
		switch ( this.phase ) {
			case 'start':
				this.startToken( upper, quoted );
				return;
			case 'set':
				this.setToken( upper, quoted );
				return;
			case 'create':
				this.createPrefixToken( upper, quoted );
				return;
			case 'create-or':
				this.phase = ! quoted && 'REPLACE' === upper ? 'create-replace' : 'other';
				return;
			case 'create-replace':
				this.createPrefixToken( upper, quoted );
				return;
			case 'temporary':
			case 'alter':
				this.tablePrefixToken( upper, quoted );
				return;
			case 'create-table':
			case 'alter-table':
				this.tableToken( text, upper, line, quoted );
		}
	}

	private engineValueToken(
		text: string,
		upper: string,
		findings: number[],
		quoted: boolean
	): boolean {
		if ( '=' === text && ! this.engineEquals ) {
			this.engineEquals = true;
			return true;
		}
		if (
			( quoted || /^[A-Z0-9_$\u0080-\uFFFF]+$/i.test( text ) ) &&
			'INNODB' !== upper &&
			! (
				this.engineOrderCandidate &&
				! this.engineEquals &&
				( 'ASC' === upper || 'DESC' === upper )
			)
		) {
			findings.push( this.engineLine );
		}
		this.engineLine = 0;
		this.engineEquals = false;
		this.engineOrderCandidate = false;
		return false;
	}

	private startToken( upper: string, quoted: boolean ): void {
		this.phase = 'other';
		if ( ! quoted && 'CREATE' === upper ) {
			this.phase = 'create';
		}
		if ( ! quoted && 'ALTER' === upper ) {
			this.phase = 'alter';
		}
		if ( ! quoted && 'SET' === upper ) {
			this.phase = 'set';
		}
	}

	private setToken( upper: string, quoted: boolean ): void {
		if ( quoted ) {
			if ( this.sqlModeAssignment ) {
				this.noBackslashEscapes = this.sqlModeValueHasMode;
				this.ansiQuotes = this.sqlModeValueHasAnsi;
				this.sqlModeAssignment = false;
			}
			return;
		}
		switch ( upper ) {
			case '@':
				this.setAtCount += 1;
				break;
			case 'SQL_MODE':
				// User variables and GLOBAL assignments do not change session modes.
				this.sqlModeAssignment = 1 !== this.setAtCount && ! this.setGlobalScope;
				this.setAtCount = 0;
				break;
			case 'GLOBAL':
				this.setGlobalScope = true;
				this.setAtCount = 0;
				break;
			case ',':
				this.setGlobalScope = false;
				this.setAtCount = 0;
				this.sqlModeAssignment = false;
				break;
			case '=':
				break;
			default:
				this.sqlModeAssignment = false;
				this.setAtCount = 0;
		}
	}

	private createPrefixToken( upper: string, quoted: boolean ): void {
		this.phase = 'other';
		if ( ! quoted && 'TEMPORARY' === upper ) {
			this.phase = 'temporary';
		}
		if ( ! quoted && 'TABLE' === upper ) {
			this.phase = 'create-table';
		}
		if ( ! quoted && 'OR' === upper ) {
			this.phase = 'create-or';
		}
	}

	private tablePrefixToken( upper: string, quoted: boolean ): void {
		if (
			'alter' === this.phase &&
			! quoted &&
			[ 'IGNORE', 'ONLINE', 'OFFLINE' ].includes( upper )
		) {
			return;
		}
		const next = 'alter' === this.phase ? 'alter-table' : 'create-table';
		this.phase = ! quoted && 'TABLE' === upper ? next : 'other';
	}

	private tableToken( text: string, upper: string, line: number, quoted: boolean ): void {
		if (
			'create-table' === this.phase &&
			'options' !== this.createStage &&
			this.createNameToken( text, upper, quoted )
		) {
			return;
		}
		this.partitionToken( text, upper, line, quoted );
		if ( this.parenthesisToken( text, quoted ) ) {
			return;
		}
		if ( 'alter-table' === this.phase ) {
			this.alterOptionToken( text, upper, line, quoted );
		} else {
			this.createOptionToken( upper, line, quoted );
		}
	}

	private createConditionalName( upper: string, quoted: boolean ): void {
		if ( ! quoted && 'if-not' === this.createStage && 'NOT' === upper ) {
			this.createStage = 'if-exists';
		} else if ( ! quoted && 'if-exists' === this.createStage && 'EXISTS' === upper ) {
			this.createStage = 'table';
		} else {
			this.phase = 'other';
		}
	}

	private createNameToken( text: string, upper: string, quoted: boolean ): boolean {
		if ( 'table' === this.createStage && ! quoted && 'IF' === upper ) {
			this.createStage = 'if-not';
			return true;
		}
		if ( 'if-not' === this.createStage || 'if-exists' === this.createStage ) {
			this.createConditionalName( upper, quoted );
			return true;
		}
		if ( 'table' === this.createStage || 'qualified' === this.createStage ) {
			this.createStage = 'after-name';
			return true;
		}
		if ( ! quoted && '.' === text ) {
			this.createStage = 'qualified';
			return true;
		}
		this.createStage = 'options';
		if ( '(' !== text || quoted ) {
			this.sawCreateBody = true;
		}

		return false;
	}

	private partitionToken( text: string, upper: string, line: number, quoted: boolean ): void {
		if ( quoted ) {
			if ( this.partitionClause ) {
				this.partitionPrevious = text;
			}
			return;
		}
		if (
			! this.depth &&
			'PARTITION' === upper &&
			( this.sawCreateBody || ( 'alter-table' === this.phase && 'actions' === this.alterStage ) )
		) {
			this.partitionClause = true;
		}
		if ( this.partitionClause ) {
			if (
				this.depth &&
				[ 'PARTITION', 'SUBPARTITION' ].includes( upper ) &&
				[ '(', ',' ].includes( this.partitionPrevious )
			) {
				this.partitionDefinitionDepth = this.depth;
			}
			if ( this.partitionDefinitionDepth === this.depth && this.depth && 'ENGINE' === upper ) {
				this.engineLine = line;
			}
			this.partitionPrevious = text;
		}
	}

	private parenthesisToken( text: string, quoted: boolean ): boolean {
		if ( ! quoted && '(' === text ) {
			this.depth += 1;
			this.sawCreateBody = true;
			return true;
		}
		if ( ! quoted && ')' === text ) {
			this.depth = Math.max( 0, this.depth - 1 );
			if ( this.depth < this.partitionDefinitionDepth ) {
				this.partitionDefinitionDepth = 0;
			}
			if ( 0 === this.depth ) {
				this.createPrevious = this.alterPrevious = ')';
			}
			return true;
		}
		if ( this.depth ) {
			return true;
		}

		return false;
	}

	private alterNameToken( text: string, upper: string, quoted: boolean ): boolean {
		if ( 'table' === this.alterStage && ! quoted && 'IF' === upper ) {
			this.alterStage = 'if-exists';
			return true;
		}
		if ( 'if-exists' === this.alterStage ) {
			this.alterStage = ! quoted && 'EXISTS' === upper ? 'table' : 'actions';
			return true;
		}
		if ( 'table' === this.alterStage || 'qualified' === this.alterStage ) {
			this.alterStage = 'after-name';
			return true;
		}
		if ( 'after-name' === this.alterStage ) {
			if ( '.' === text ) {
				this.alterStage = 'qualified';
				return true;
			}
			this.alterStage = 'actions';
			this.alterCanEngine = true;
		}

		return false;
	}

	private alterOptionToken( text: string, upper: string, line: number, quoted: boolean ): void {
		const previous = this.alterPrevious;
		this.alterPrevious =
			'=' === previous || ( 'DEFAULT' === upper && ALTER_TABLE_OPTIONS.has( previous ) )
				? '<value>'
				: upper;
		if ( this.alterNameToken( text, upper, quoted ) ) {
			return;
		}
		if ( ',' === text && ! quoted ) {
			this.alterCanEngine = true;
			this.alterInOptions = false;
			return;
		}
		if ( this.alterCanEngine && ! quoted && 'ORDER' === upper ) {
			this.alterInOrder = true;
		} else if ( this.alterCanEngine && ! quoted && ALTER_TABLE_OPTIONS.has( upper ) ) {
			this.alterInOptions = true;
		}
		if (
			( this.alterCanEngine || ( this.alterInOptions && ! isOptionValuePrefix( previous ) ) ) &&
			! quoted &&
			'ENGINE' === upper
		) {
			this.engineLine = line;
			this.engineOrderCandidate = this.alterInOrder;
		}
		this.alterCanEngine = false;
	}

	private createOptionToken( upper: string, line: number, quoted: boolean ): void {
		const previous = this.createPrevious;
		this.createPrevious =
			'=' === previous || ( 'DEFAULT' === upper && ALTER_TABLE_OPTIONS.has( previous ) )
				? '<value>'
				: upper;
		if (
			this.sawCreateBody &&
			! quoted &&
			'ENGINE' === upper &&
			! isOptionValuePrefix( previous )
		) {
			this.engineLine = line;
		} else if ( this.sawCreateBody && ! quoted && ( 'AS' === upper || 'SELECT' === upper ) ) {
			this.phase = 'other';
		}
	}

	// SQL mode values stream through bounded comma-separated segments so a
	// NO_BACKSLASH_ESCAPES entry beyond any fixed capture window is still
	// recognized while buffering stays small.
	private extendSqlModeSegment( span: string ): void {
		if ( this.sqlModeSegmentLong ) {
			return;
		}
		this.sqlModeSegment += span;
		if ( this.sqlModeSegment.length > 128 ) {
			this.sqlModeSegmentLong = true;
			this.sqlModeSegment = '';
		}
	}

	private completeSqlModeSegment(): void {
		const mode = this.sqlModeSegment.trim().toUpperCase();
		if ( ! this.sqlModeSegmentLong && 'NO_BACKSLASH_ESCAPES' === mode ) {
			this.sqlModeValueHasMode = true;
		}
		if (
			! this.sqlModeSegmentLong &&
			[ 'ANSI', 'ANSI_QUOTES', 'DB2', 'MAXDB', 'MSSQL', 'ORACLE', 'POSTGRESQL' ].includes( mode )
		) {
			this.sqlModeValueHasAnsi = true;
		}
		this.sqlModeSegment = '';
		this.sqlModeSegmentLong = false;
	}

	private appendSqlMode( chunk: string ): void {
		while ( chunk.length ) {
			const comma = chunk.indexOf( ',' );
			if ( -1 === comma ) {
				this.extendSqlModeSegment( chunk );
				return;
			}
			this.extendSqlModeSegment( chunk.slice( 0, comma ) );
			this.completeSqlModeSegment();
			chunk = chunk.slice( comma + 1 );
		}
	}

	private captureQuotedSpan( span: string, multiline: boolean ): void {
		const suffix = multiline ? '\n' : '';
		if ( this.sqlModeAssignment ) {
			this.appendSqlMode( span + suffix );
		} else if ( this.engineLine ) {
			this.quotedValue = ( this.quotedValue + span.slice( 0, 128 ) + suffix ).slice( 0, 128 );
		}
	}

	private quoteIsEscaped( line: string, end: number ): boolean {
		let slashes = 0;
		for ( let cursor = end - 1; cursor >= 0 && '\\' === line[ cursor ]; cursor-- ) {
			slashes++;
		}
		const identifier = '`' === this.quote || ( '"' === this.quote && this.ansiQuotes );
		return ! identifier && ! this.noBackslashEscapes && Boolean( slashes % 2 );
	}

	private scanQuoted(
		line: string,
		index: number,
		lineNumber: number,
		findings: number[]
	): number {
		const end = line.indexOf( this.quote, index );
		if ( -1 === end ) {
			this.captureQuotedSpan( line.slice( index ), true );
			return line.length;
		}
		this.captureQuotedSpan( line.slice( index, end ), false );
		const escaped = this.quoteIsEscaped( line, end );
		if ( escaped || line[ end + 1 ] === this.quote ) {
			return end + ( line[ end + 1 ] === this.quote && ! escaped ? 2 : 1 );
		}

		this.quote = '';
		if ( this.sqlModeAssignment ) {
			this.completeSqlModeSegment();
		}
		this.token( this.quotedValue, lineNumber, findings, true );
		this.quotedValue = '';
		return end + 1;
	}

	private openComment( line: string, index: number ): number {
		// Inspect only the bounded executable-comment prefix and version.
		// eslint-disable-next-line security/detect-unsafe-regex
		const marker = /^\/\*(?:!|M!)(?:\d{5,6})?/i.exec( line.slice( index, index + 12 ) );
		if ( marker ) {
			this.executable = true;
			return index + marker[ 0 ].length;
		}
		this.block = true;
		return index + 2;
	}

	private isLineComment( line: string, index: number ): boolean {
		return (
			'#' === line[ index ] ||
			( line.startsWith( '--', index ) &&
				( index + 2 === line.length ||
					line.charCodeAt( index + 2 ) <= 0x20 ||
					0x7f === line.charCodeAt( index + 2 ) ) )
		);
	}

	private openQuote( quote: string ): void {
		this.quote = quote;
		this.quotedValue = '';
		this.sqlModeSegment = '';
		this.sqlModeSegmentLong = false;
		this.sqlModeValueHasMode = false;
		this.sqlModeValueHasAnsi = false;
	}

	private scanToken( line: string, index: number, lineNumber: number, findings: number[] ): number {
		if ( 'other' === this.phase && ';' !== line[ index ] ) {
			const special = /['"`;#/-]/g;
			special.lastIndex = index + 1;
			const match = special.exec( line );
			const delimiterIndex = line.indexOf( this.delimiter, index + 1 );
			return Math.min(
				match?.index ?? line.length,
				-1 === delimiterIndex ? line.length : delimiterIndex
			);
		}
		const word = /^[A-Za-z0-9_$\u0080-\uFFFF]+/.exec( line.slice( index ) );
		if ( word ) {
			const delimiterIndex = word[ 0 ].indexOf( this.delimiter );
			const text = -1 === delimiterIndex ? word[ 0 ] : word[ 0 ].slice( 0, delimiterIndex );
			this.token( text, lineNumber, findings );
			return index + text.length;
		}
		if ( '(),.='.includes( line[ index ] ) ) {
			this.token( line[ index ], lineNumber, findings );
		}
		return index + 1;
	}

	private scanUnquoted(
		line: string,
		index: number,
		lineNumber: number,
		findings: number[]
	): number {
		if ( this.executable && line.startsWith( '*/', index ) ) {
			this.executable = false;
			return index + 2;
		}
		if ( line.startsWith( this.delimiter, index ) ) {
			this.token( ';', lineNumber, findings );
			return index + this.delimiter.length;
		}
		if ( line.startsWith( '/*', index ) ) {
			return this.openComment( line, index );
		}
		if ( this.isLineComment( line, index ) ) {
			return line.length;
		}
		if ( '\'"`'.includes( line[ index ] ) ) {
			this.openQuote( line[ index ] );
			return index + 1;
		}
		if ( 'set' === this.phase && '@' === line[ index ] ) {
			this.token( '@', lineNumber, findings );
			return index + 1;
		}
		return this.scanToken( line, index, lineNumber, findings );
	}

	// Check lexical states in order; quoted text and comments can span lines.
	public scan( line: string, lineNumber: number ): number[] {
		const findings: number[] = [];
		if ( ! this.started ) {
			this.started = true;
			line = line.replace( /^(?:\uFEFF|\u00EF\u00BB\u00BF)/, '' );
		}
		if ( ! this.quote && ! this.block && ! this.executable ) {
			const directive = /^[ \t]*DELIMITER[ \t]+([^ \t\r\n]+)[ \t]*$/i.exec( line );
			if ( directive ) {
				this.delimiter = directive[ 1 ];
				this.resetStatement();
				return findings;
			}
		}
		let index = 0;
		while ( index < line.length ) {
			if ( this.block ) {
				const end = line.indexOf( '*/', index );
				if ( -1 === end ) {
					break;
				}
				this.block = false;
				index = end + 2;
			} else if ( this.quote ) {
				index = this.scanQuoted( line, index, lineNumber, findings );
			} else {
				index = this.scanUnquoted( line, index, lineNumber, findings );
			}
		}
		return [ ...new Set( findings ) ];
	}

	public finish(): void {
		if ( this.quote || this.block || this.executable ) {
			throw new Error(
				'SQL engine validation could not finish: unterminated quoted value or block comment.'
			);
		}
	}
}
