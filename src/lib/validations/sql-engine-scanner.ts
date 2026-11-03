// A streaming scanner for CREATE/ALTER TABLE engine options. It never retains
// row data; quoted text and comments can cross physical lines.
export class SqlEngineScanner {
	private phase:
		| 'start'
		| 'create'
		| 'temporary'
		| 'alter'
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
	private alterStage: 'table' | 'if-exists' | 'after-name' | 'qualified' | 'actions' = 'table';
	private alterCanEngine = false;
	private engineLine = 0;
	private engineEquals = false;

	private resetStatement(): void {
		this.phase = 'start';
		this.depth = 0;
		this.sawCreateBody = false;
		this.createStage = 'table';
		this.alterStage = 'table';
		this.alterCanEngine = false;
		this.engineLine = 0;
		this.engineEquals = false;
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
			if ( ( quoted || /^[A-Z0-9_$]+$/i.test( text ) ) && 'INNODB' !== upper ) {
				findings.push( this.engineLine );
			}
			this.engineLine = 0;
			this.engineEquals = false;
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
			return;
		}
		if ( this.depth ) {
			return;
		}
		if ( 'alter-table' === this.phase ) {
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
				return;
			}
			if ( this.alterCanEngine && ! quoted && 'ENGINE' === upper ) {
				this.engineLine = line;
			}
			this.alterCanEngine = false;
			return;
		}
		if ( this.sawCreateBody && ! quoted && 'ENGINE' === upper ) {
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
					if ( this.engineLine ) {
						this.quotedValue = ( this.quotedValue + line.slice( index, index + 128 ) + '\n' ).slice(
							0,
							128
						);
					}
					break;
				}
				if ( this.engineLine ) {
					this.quotedValue = (
						this.quotedValue + line.slice( index, Math.min( end, index + 128 ) )
					).slice( 0, 128 );
				}
				let slashes = 0;
				for ( let cursor = end - 1; cursor >= 0 && '\\' === line[ cursor ]; cursor-- ) {
					slashes++;
				}
				if ( ( '`' !== this.quote && slashes % 2 ) || line[ end + 1 ] === this.quote ) {
					index =
						end +
						( line[ end + 1 ] === this.quote && ! ( '`' !== this.quote && slashes % 2 ) ? 2 : 1 );
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
			const word = /^[A-Za-z0-9_$]+/.exec( line.slice( index ) );
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
