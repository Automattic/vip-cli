export function preparseEnvData( data: string ): string[] {
	return data
		.split( /\r?\n/ )
		.map( line => line.trim() )
		.filter( line => line && ! line.startsWith( '#' ) );
}

export function parseEnvValue( value: string ): string {
	if ( value.startsWith( '"' ) && value.endsWith( '"' ) ) {
		return value.slice( 1, -1 ).replace( /\\(["$\\nrt])/g, ( match, char: string ) => {
			switch ( char ) {
				case '"':
				case '$':
				case '\\':
					return char;
				case 'n':
					return '\n';
				case 'r':
					return '\r';
				case 't':
					return '\t';
				default:
					return match;
			}
		} );
	}

	if ( value.startsWith( "'" ) && value.endsWith( "'" ) ) {
		return value.slice( 1, -1 ).replace( /\\'/g, "'" );
	}

	return value;
}

export function quoteEnvValue( value: string ): string {
	return `"${ value.replace( /[\\"$\n\r\t]/g, match => {
		switch ( match ) {
			case '\\':
			case '"':
			case '$':
				return '\\' + match;
			case '\n':
				return '\\n';
			case '\r':
				return '\\r';
			case '\t':
				return '\\t';
			default:
				return match;
		}
	} ) }"`;
}
