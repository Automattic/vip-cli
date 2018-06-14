const fs = require( 'fs' );

const environment = process.argv[ 2 ] || 'local';

const srcFile = `config/config.${ environment }.json`;
const destFile = 'config/config.json';

// If the file is not there, we shouldn't bother
const srcExists = fs.existsSync( srcFile );
if ( ! srcExists ) {
	console.log( `prepareConfig: source file (${ srcFile }) not found; skipping` );
	process.exit( 0 );
}

console.log( `prepareConfig: ${ srcFile } => ${ destFile }` );

// Can't use fs.copyFileSync as it's 8.5+
const srcContents = fs.readFileSync( srcFile );
fs.writeFileSync( destFile, srcContents );
