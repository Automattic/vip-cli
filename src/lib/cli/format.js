// @flow

type Options = {
};

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
	const chalk = require( 'chalk' );

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

	lines.push( '===================================' );
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
