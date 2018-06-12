const fs = require( 'fs' );

const environment = process.argv[ 2 ] || 'local';

const src = `config/config.${ environment }.json`;
const dest = 'config/config.json';

console.log( `Updating config: ${ src } => ${ dest }` );

fs.copyFileSync( src, dest );
