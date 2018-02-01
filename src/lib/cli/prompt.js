const promptly = require( 'promptly' );
const colors = require( 'colors' );

module.exports = {};

module.exports.confirm = async function( values, message ) {
	m( values );
	return promptly.confirm( message );
};

function m( values ) {
	console.log( '===================================' );
	for ( const k in values ) {
		let v = values[ k ];

		switch ( k ) {
			case 'Environment':
				if ( 'production' === v.toLowerCase() ) {
					v = v.toUpperCase().red;
				} else {
					v = v.toLowerCase().blue;
				}
				break;
		}

		console.log( '+', `${ k }:`, v );
	}
	console.log( '===================================' );
}
