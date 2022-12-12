const cp = require( 'child_process' );
const path = require( 'path' );

const files = [
	path.join( __dirname, 'check-version.js' ),
	path.join( __dirname, 'generate-keys.js' ),
];

files.forEach( file => {
	cp.spawnSync( process.argv[ 0 ], [ file ], { stdio: 'inherit' } );
} );
