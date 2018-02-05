// @flow
const promptly = require( 'promptly' );
require( 'colors' );

module.exports = {};

module.exports.confirm = async function( values: any, message: string ): Promise<boolean> {
	console.log( m( values ) );
	return promptly.confirm( message );
};

function m( values: any ): string {
	const lines = [];

	lines.push( '===================================' );
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

		lines.push( `+ ${ k }: ${ v }` );
	}
	lines.push( '===================================' );

	return lines.join( '\n' );
}
