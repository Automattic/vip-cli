module.exports = function( data, format, opts ) {
	if ( ! data || ! data.length ) {
		return;
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
};

function ids( data, opts ) {
	const fields = Object.keys( data[ 0 ] ).map( key => key.toLowerCase() );
	if ( 0 > fields.indexOf( 'id' ) ) {
		return 'No ID field found';
	}

	const id = [];
	data.forEach( d => id.push( d.id ) );

	return id.join( ' ' );
}

function csv( data, opts ) {
	const json2csv = require( 'json2csv' );
	const fields = Object.keys( data[ 0 ] );

	return json2csv( { data: data, fields: fields } );
}

function table( data, opts ) {
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
