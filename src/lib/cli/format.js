/** @format */
// @flow
/**
 * External dependencies
 */
import chalk from 'chalk';

type Options = {};

export type Tuple = {
	key: string,
	value: string,
};

export function formatData( data: Array<any>, format: string, opts: ?Options ): string {
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

export function formatEnvironment( environment: string ): string {
	if ( 'production' === environment.toLowerCase() ) {
		return chalk.red( environment.toUpperCase() );
	}

	return chalk.blueBright( environment.toLowerCase() );
}

function ids( data: Array<any> ): string {
	const fields = Object.keys( data[ 0 ] ).map( key => key.toLowerCase() );
	if ( 0 > fields.indexOf( 'id' ) ) {
		return 'No ID field found';
	}

	const id = [];
	data.forEach( d => id.push( d.id ) );

	return id.join( ' ' );
}

function csv( data: Array<any> ): string {
	const json2csv = require( 'json2csv' );
	const fields = Object.keys( data[ 0 ] );

	return json2csv( { data: data, fields: formatFields( fields ) } );
}

function table( data: Array<any> ): string {
	const Table = require( 'cli-table' );
	const fields = Object.keys( data[ 0 ] );
	const t = new Table( {
		head: formatFields( fields ),
		style: {
			head: [ 'blueBright' ],
		},
	} );

	data.forEach( d => {
		const row = [];
		fields.forEach( h => row.push( d[ h ] ) );
		t.push( row );
	} );

	return t.toString();
}

function formatFields( fields: Array<string> ) {
	return fields.map( field => {
		return field
			.split( /(?=[A-Z])/ )
			.join( ' ' )
			.toLowerCase();
	} );
}

export function keyValue( values: Array<Tuple> ): string {
	const lines = [];
	const pairs = values.length > 0;

	pairs ? lines.push( '===================================' ) : '';

	for ( const i of values ) {
		let v = i.value;

		switch ( i.key.toLowerCase() ) {
			case 'environment':
				v = formatEnvironment( v );
				break;
		}

		lines.push( `+ ${ i.key }: ${ v }` );
	}

	lines.push( '===================================' );

	return lines.join( '\n' );
}

export function requoteArgs( args: Array<string> ): Array<string> {
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

export const RUNNING_SPRITE_GLYPHS = [ '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏' ];

export class RunningSprite {
	i: number;

	constructor() {
		this.i = 0;
	}

	next() {
		if ( ++this.i >= RUNNING_SPRITE_GLYPHS.length ) {
			this.i = 0;
		}
	}

	toString() {
		const glyph = RUNNING_SPRITE_GLYPHS[ this.i ];
		return glyph;
	}
}

export function getGlyphForStatus( status: string, runningSprite: RunningSprite ) {
	switch ( status ) {
		case 'pending':
			return '○';
		case 'running':
			return chalk.blueBright( runningSprite );
		case 'success':
			return chalk.green( '✓' );
		case 'failed':
			return chalk.red( '✕' );
		default:
		case 'unknown':
			return chalk.yellow( '✕' );
		case 'skipped':
			return chalk.green( '✕' );
	}
}

export function formatJobSteps( steps: Object[], runningSprite: RunningSprite ) {
	const currentStepIndex = steps.findIndex( ( { status } ) =>
		[ 'running', 'pending' ].includes( status )
	);
	return steps.reduce( ( carry, step, index ) => {
		const stepShowsRunning = currentStepIndex !== -1 && currentStepIndex === index;
		carry += `${ getGlyphForStatus( stepShowsRunning ? 'running' : step.status, runningSprite ) } ${
			step.name
		}`;
		if ( stepShowsRunning ) {
			carry += ' (Press ^C to hide progress. The import will continue in the background.)';
		}
		carry += '\n';
		return carry;
	}, '' );
}
