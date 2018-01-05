module.exports = function( data, format, opts ) {
	if ( ! data || ! data.length ) {
		return;
	}

	switch ( format ) {
		case 'ids':
			return ids( data, opts );

		case 'csv':
			return csv( data, opts );

		case 'table':
		default:
			return table( data, opts );
	}
};

function ids( data, opts ) {
	data = data.map( d => d.id );
	return data.join( ' ' );
}

function csv( data, opts ) {
	const json2csv = require( 'json2csv' );
	const fields = Object.keys( data[0] );

	return json2csv({ data: data, fields: fields });
}

function table( data, opts ) {
	const Table = require( 'cli-table' );
	const fields = Object.keys( data[0] );
	const table = new Table({
		head: fields,
		style: {
			head: [ 'blue' ],
		},
	});

	data.forEach( d => {
		let row = [];
		fields.forEach( h => row.push( d[ h ] ) );
		table.push( row );
	});

	return table.toString();
}
