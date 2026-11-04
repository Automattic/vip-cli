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
	private sqlModeAssignment = false;

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
	}

	// State transitions mirror the bounded CREATE/ALTER TABLE grammar.
	// eslint-disable-next-line complexity
	private token( text: string, line: number, findings: number[], quoted = false ): void {
		const upper = text.toUpperCase();
		if ( this.engineLine ) {
			if ( '=' === text && ! this.engineEquals ) {
				this.engineEquals = true;
				return;
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
		}
		if ( ';' === text && ! quoted ) {
			this.resetStatement();
			return;
		}
		if ( 'start' === this.phase ) {
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
			return;
		}
		if ( 'set' === this.phase ) {
			if ( quoted && this.sqlModeAssignment ) {
				this.noBackslashEscapes = upper
					.split( ',' )
					.some( mode => 'NO_BACKSLASH_ESCAPES' === mode.trim() );
				this.sqlModeAssignment = false;
			} else if ( ! quoted && 'SQL_MODE' === upper ) {
				this.sqlModeAssignment = true;
			} else if ( ! quoted && '=' !== text ) {
				this.sqlModeAssignment = false;
			}
			return;
		}
		if ( 'create' === this.phase ) {
			this.phase = 'other';
			if ( ! quoted && 'TEMPORARY' === upper ) {
				this.phase = 'temporary';
			}
			if ( ! quoted && 'TABLE' === upper ) {
				this.phase = 'create-table';
			}
			return;
		}
		if ( 'temporary' === this.phase || 'alter' === this.phase ) {
			const next = 'alter' === this.phase ? 'alter-table' : 'create-table';
			this.phase = ! quoted && 'TABLE' === upper ? next : 'other';
			return;
		}
		if ( 'create-table' !== this.phase && 'alter-table' !== this.phase ) {
			return;
		}
		if ( 'create-table' === this.phase && 'options' !== this.createStage ) {
			if ( 'table' === this.createStage && ! quoted && 'IF' === upper ) {
				this.createStage = 'if-not';
				return;
			}
			if ( 'if-not' === this.createStage || 'if-exists' === this.createStage ) {
				if ( ! quoted && 'if-not' === this.createStage && 'NOT' === upper ) {
					this.createStage = 'if-exists';
				} else if ( ! quoted && 'if-exists' === this.createStage && 'EXISTS' === upper ) {
					this.createStage = 'table';
				} else {
					this.phase = 'other';
				}
				return;
			}
			if ( 'table' === this.createStage || 'qualified' === this.createStage ) {
				this.createStage = 'after-name';
				return;
			}
			if ( ! quoted && '.' === text ) {
				this.createStage = 'qualified';
				return;
			}
			this.createStage = 'options';
			if ( '(' !== text || quoted ) {
				this.sawCreateBody = true;
			}
		}
		if ( ! quoted && '(' === text ) {
			this.depth += 1;
			this.sawCreateBody = true;
			return;
		}
		if ( ! quoted && ')' === text ) {
			this.depth = Math.max( 0, this.depth - 1 );
			if ( 0 === this.depth ) {
				this.createPrevious = this.alterPrevious = ')';
			}
			return;
		}
		if ( this.depth ) {
			return;
		}
		if ( 'alter-table' === this.phase ) {
			const previous = this.alterPrevious;
			this.alterPrevious =
				'=' === previous || ( 'DEFAULT' === upper && ALTER_TABLE_OPTIONS.has( previous ) )
					? '<value>'
					: upper;
			if ( 'table' === this.alterStage && ! quoted && 'IF' === upper ) {
				this.alterStage = 'if-exists';
				return;
			}
			if ( 'if-exists' === this.alterStage ) {
				this.alterStage = ! quoted && 'EXISTS' === upper ? 'table' : 'actions';
				return;
			}
			if ( 'table' === this.alterStage || 'qualified' === this.alterStage ) {
				this.alterStage = 'after-name';
				return;
			}
			if ( 'after-name' === this.alterStage ) {
				if ( '.' === text ) {
					this.alterStage = 'qualified';
					return;
				}
				this.alterStage = 'actions';
				this.alterCanEngine = true;
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
			return;
		}
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

	// The lexical states must be checked in order for each input segment.
	// eslint-disable-next-line complexity
	public scan( line: string, lineNumber: number ): number[] {
		const findings: number[] = [];
		let index = 0;
		while ( index < line.length ) {
			if ( this.block ) {
				const end = line.indexOf( '*/', index );
				if ( -1 === end ) {
					break;
				}
				this.block = false;
				index = end + 2;
				continue;
			}
			if ( this.quote ) {
				const end = line.indexOf( this.quote, index );
				if ( -1 === end ) {
					if ( this.engineLine || this.sqlModeAssignment ) {
						this.quotedValue = ( this.quotedValue + line.slice( index, index + 128 ) + '\n' ).slice(
							0,
							128
						);
					}
					break;
				}
				if ( this.engineLine || this.sqlModeAssignment ) {
					this.quotedValue = (
						this.quotedValue + line.slice( index, Math.min( end, index + 128 ) )
					).slice( 0, 128 );
				}
				let slashes = 0;
				for ( let cursor = end - 1; cursor >= 0 && '\\' === line[ cursor ]; cursor-- ) {
					slashes++;
				}
				const escaped = '`' !== this.quote && ! this.noBackslashEscapes && slashes % 2;
				if ( escaped || line[ end + 1 ] === this.quote ) {
					index = end + ( line[ end + 1 ] === this.quote && ! escaped ? 2 : 1 );
					continue;
				}
				index = end + 1;
				this.quote = '';
				this.token( this.quotedValue, lineNumber, findings, true );
				this.quotedValue = '';
				continue;
			}
			if ( this.executable && line.startsWith( '*/', index ) ) {
				this.executable = false;
				index += 2;
				continue;
			}
			if ( line.startsWith( '/*', index ) ) {
				// Only inspect the bounded executable-comment prefix and version.
				// eslint-disable-next-line security/detect-unsafe-regex
				const marker = /^\/\*(?:!|M!)(?:\d{5,6})?/i.exec( line.slice( index, index + 12 ) );
				if ( marker ) {
					this.executable = true;
					index += marker[ 0 ].length;
				} else {
					this.block = true;
					index += 2;
				}
				continue;
			}
			if (
				'#' === line[ index ] ||
				( line.startsWith( '--', index ) &&
					( index + 2 === line.length || /\s/.test( line[ index + 2 ] ) ) )
			) {
				break;
			}
			if ( '\'"`'.includes( line[ index ] ) ) {
				this.quote = line[ index++ ];
				this.quotedValue = '';
				continue;
			}
			if ( 'other' === this.phase && ';' !== line[ index ] ) {
				const special = /['"`;#/-]/g;
				special.lastIndex = index + 1;
				const match = special.exec( line );
				index = match?.index ?? line.length;
				continue;
			}
			const word = /^[A-Za-z0-9_$\u0080-\uFFFF]+/.exec( line.slice( index ) );
			if ( word ) {
				this.token( word[ 0 ], lineNumber, findings );
				index += word[ 0 ].length;
				continue;
			}
			if ( '();,.='.includes( line[ index ] ) ) {
				this.token( line[ index ], lineNumber, findings );
			}
			index++;
		}
		return [ ...new Set( findings ) ];
	}
}
