const fs = require( 'node:fs' );
const path = require( 'node:path' );

const { bin } = require( '../package.json' );

for ( const target of new Set( Object.values( bin ) ) ) {
	const filename = path.resolve( __dirname, '..', target );
	fs.chmodSync( filename, 0o755 );
}
