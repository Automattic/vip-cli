// @format

/**
 * External dependencies
 */
import chalk from 'chalk';
import { Parser } from 'json2csv';
import Table from 'cli-table';

export interface Tuple {
	key: string;
	value: string;
}

type Stringable =
	| string
	| {
			toString: () => string;
	  };

export function formatData( data: Tuple[], format: 'keyValue' ): string;
export function formatData( data: Record< string, Stringable >[], format: 'table' ): string;
export function formatData(
	data: Record< string, unknown >[],
	format: 'ids' | 'json' | 'csv'
): string;
export function formatData(
	data: Record< string, unknown >[] | Tuple[],
	format: 'keyValue' | 'ids' | 'json' | 'csv' | 'table'
): string {
	if ( ! data.length ) {
		return '';
	}

	switch ( format ) {
		case 'ids':
			return ids( data as Record< string, unknown >[] );

		case 'json':
			return JSON.stringify( data, null, '\t' );

		case 'csv':
			return csv( data as Record< string, unknown >[] );

		case 'keyValue':
			return keyValue( data as Tuple[] );

		case 'table':
		default:
			return table( data as Record< string, Stringable >[] );
	}
}

export function formatEnvironment( environment: string ): string {
	if ( 'production' === environment.toLowerCase() ) {
		return chalk.red( environment.toUpperCase() );
	}

	return chalk.blueBright( environment.toLowerCase() );
}

function ids( data: Record< string, unknown >[] ): string {
	const fields = Object.keys( data[ 0 ] ).map( key => key.toLowerCase() );
	if ( 0 > fields.indexOf( 'id' ) ) {
		return 'No ID field found';
	}

	const id = data.map( datum => datum.id );
	return id.join( ' ' );
}

function csv( data: Record< string, unknown >[] ): string {
	const fields = Object.keys( data[ 0 ] );

	const parser = new Parser( { fields: formatFields( fields ) } );

	return parser.parse( data );
}

export function table( data: Record< string, Stringable >[] ): string {
	const fields = Object.keys( data[ 0 ] );
	const dataTable = new Table( {
		head: formatFields( fields ),
		style: {
			head: [ 'blueBright' ],
		},
	} );

	data.forEach( datum => {
		const row = fields.map( field => datum[ field ].toString() );
		dataTable.push( row );
	} );

	return dataTable.toString();
}

function formatFields( fields: string[] ) {
	return fields.map( field => {
		return field
			.split( /(?=[A-Z])/ )
			.join( ' ' )
			.toLowerCase();
	} );
}

export function keyValue( values: Tuple[] ): string {
	const lines = [];
	const pairs = values.length > 0;

	if ( pairs ) {
		lines.push( '===================================' );
	}

	for ( const { key, value } of values ) {
		let formattedValue: string;

		switch (
			key.toLowerCase() // NOSONAR
		) {
			case 'environment':
				formattedValue = formatEnvironment( value );
				break;

			default:
				formattedValue = value;
				break;
		}

		lines.push( `+ ${ key }: ${ formattedValue }` );
	}

	lines.push( '===================================' );

	return lines.join( '\n' );
}

export function requoteArgs( args: string[] ): string[] {
	return args.map( arg => {
		if ( arg.includes( '--' ) && arg.includes( '=' ) && arg.includes( ' ' ) ) {
			return arg.replace( /^--([^=]*)=(.*)$/, '--$1="$2"' );
		}

		if ( arg.includes( ' ' ) && ! isJsonObject( arg ) ) {
			return `"${ arg }"`;
		}

		return arg;
	} );
}

export function isJsonObject( str: unknown ): boolean {
	return typeof str === 'string' && str.trim().startsWith( '{' ) && isJson( str );
}

export function isJson( str: string ): boolean {
	try {
		JSON.parse( str );
		return true;
	} catch ( error ) {
		return false;
	}
}

export function capitalize( str: unknown ): string {
	if ( typeof str !== 'string' || ! str.length ) {
		return '';
	}

	return str[ 0 ].toUpperCase() + str.slice( 1 );
}

export const RUNNING_SPRITE_GLYPHS = [ '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏' ];

export class RunningSprite {
	count: number;

	constructor() {
		this.count = 0;
	}

	next() {
		if ( ++this.count >= RUNNING_SPRITE_GLYPHS.length ) {
			this.count = 0;
		}
	}

	toString() {
		const glyph = RUNNING_SPRITE_GLYPHS[ this.count ];
		this.next(); // TODO: throttle
		return glyph;
	}
}

export function getGlyphForStatus( status: string, runningSprite: RunningSprite ): string {
	switch ( status ) {
		case 'pending':
			return '○';
		case 'running':
			return chalk.blueBright( runningSprite );
		case 'success':
			return chalk.green( '✓' );
		case 'failed':
			return chalk.red( '✕' );
		case 'unknown':
			return chalk.yellow( '✕' );
		case 'skipped':
			return chalk.green( '-' );
		default:
			return '';
	}
}

// Format Search and Replace values to output
export function formatSearchReplaceValues< T = unknown >(
	values: string | string[],
	message: ( from: string, to: string ) => T
): T[] {
	// Convert single pair S-R values to arrays
	const searchReplaceValues = typeof values === 'string' ? [ values ] : values;

	return searchReplaceValues.map( pairs => {
		// Turn each S-R pair into its own array, then trim away whitespace
		const [ from, to ] = pairs.split( ',' ).map( pair => pair.trim() );

		return message( from, to );
	} );
}

// Format bytes into kilobytes, megabytes, etc based on the size
export const formatBytes = ( bytes: number, decimals = 2 ): string => {
	if ( 0 === bytes ) {
		return '0 Bytes';
	}

	const bytesMultiplier = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = [ 'bytes', 'KB', 'MB', 'GB', 'TB' ];
	const idx = Math.floor( Math.log( bytes ) / Math.log( bytesMultiplier ) );

	return `${ parseFloat( ( bytes / Math.pow( bytesMultiplier, idx ) ).toFixed( dm ) ) } ${
		sizes[ idx ]
	}`;
};
