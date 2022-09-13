/**
 * External dependencies
 */
import chalk from 'chalk';

export function formatData( data, format, opts ) {
	if ( ! data || ! data.length ) {
		return '';
	}

	switch ( format ) {
		case 'ids':
			return ids( data, opts );

		case 'json':
			return JSON.stringify( data, null, '\t' );

		case 'csv':
			return csv( data, opts );

		case 'keyValue':
			return keyValue( data, opts );

		case 'table':
		default:
			return table( data, opts );
	}
}

export function formatEnvironment( environment ) {
	if ( 'production' === environment.toLowerCase() ) {
		return chalk.red( environment.toUpperCase() );
	}

	return chalk.blueBright( environment.toLowerCase() );
}

function ids( data ) {
	const fields = Object.keys( data[ 0 ] ).map( key => key.toLowerCase() );
	if ( 0 > fields.indexOf( 'id' ) ) {
		return 'No ID field found';
	}

	const id = [];
	data.forEach( datum => id.push( datum.id ) );

	return id.join( ' ' );
}

function csv( data ) {
	const { Parser } = require( 'json2csv' );
	const fields = Object.keys( data[ 0 ] );

	const parser = new Parser( { fields: formatFields( fields ) } );

	return parser.parse( data );
}

export function table( data ) {
	const Table = require( 'cli-table' );
	const fields = Object.keys( data[ 0 ] );
	const dataTable = new Table( {
		head: formatFields( fields ),
		style: {
			head: [ 'blueBright' ],
		},
	} );

	data.forEach( datum => {
		const row = [];
		fields.forEach( field => row.push( datum[ field ] ) );
		dataTable.push( row );
	} );

	return dataTable.toString();
}

function formatFields( fields ) {
	return fields.map( field => {
		return field
			.split( /(?=[A-Z])/ )
			.join( ' ' )
			.toLowerCase();
	} );
}

export function keyValue( values ) {
	const lines = [];
	const pairs = values.length > 0;

	pairs ? lines.push( '===================================' ) : '';

	for ( const { key, value } of values ) {
		let formattedValue = value;

		switch ( key.toLowerCase() ) {
			case 'environment':
				formattedValue = formatEnvironment( value );
				break;
		}

		lines.push( `+ ${ key }: ${ formattedValue }` );
	}

	lines.push( '===================================' );

	return lines.join( '\n' );
}

export function requoteArgs( args ) {
	return args.map( arg => {
		if ( arg.includes( '--' ) && arg.includes( '=' ) && arg.includes( ' ' ) ) {
			return arg.replace( /^--(.*)=(.*)$/, '--$1="$2"' );
		}

		if ( arg.includes( ' ' ) ) {
			return `"${ arg }"`;
		}

		return arg;
	} );
}

export function capitalize( str ) {
	if ( typeof str !== 'string' || ! str.length ) {
		return '';
	}
	return str[ 0 ].toUpperCase() + str.slice( 1 );
}

export const RUNNING_SPRITE_GLYPHS = [ '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏' ];

export class RunningSprite {
	count;

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

export function getGlyphForStatus( status, runningSprite ) {
	switch ( status ) {
		default:
			return '';
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
	}
}

// Format Search and Replace values to output
export const formatSearchReplaceValues = ( values, message ) => {
	// Convert single pair S-R values to arrays
	const searchReplaceValues = typeof values === 'string' ? [ values ] : values;

	const formattedOutput = searchReplaceValues.map( pairs => {
		// Turn each S-R pair into its own array, then trim away whitespace
		const [ from, to ] = pairs.split( ',' ).map( pair => pair.trim() );

		const output = message( from, to );

		return output;
	} );
	return formattedOutput;
};
