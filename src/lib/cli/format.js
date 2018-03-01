// @flow

type Options = {
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

		case 'table':
		default:
			return table( data, opts );
	}
}

export function formatEnvironment( environment: string ): string {
	const colors = require( 'colors' );

	if ( 'production' === environment.toLowerCase() ) {
		return colors.red( environment.toUpperCase() );
	}

	return colors.blue( environment.toLowerCase() );
}

function ids( data: Array<any>, opts: ?Options ): string {
	const fields = Object.keys( data[ 0 ] ).map( key => key.toLowerCase() );
	if ( 0 > fields.indexOf( 'id' ) ) {
		return 'No ID field found';
	}

	const id = [];
	data.forEach( d => id.push( d.id ) );

	return id.join( ' ' );
}

function csv( data: Array<any>, opts: ?Options ): string {
	const json2csv = require( 'json2csv' );
	const fields = Object.keys( data[ 0 ] );

	return json2csv( { data: data, fields: fields } );
}

function table( data: Array<any>, opts: ?Options ): string {
	const Table = require( 'cli-table' );
	const fields = Object.keys( data[ 0 ] );
	const t = new Table( {
		head: fields,
		style: {
			head: [ 'blue' ],
		},
	} );

	data.forEach( d => {
		const row = [];
		fields.forEach( h => row.push( d[ h ] ) );
		t.push( row );
	} );

	return t.toString();
}
