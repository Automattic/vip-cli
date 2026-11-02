// Help must render without initializing request clients, analytics, or renderers.
const Module = require( 'node:module' );
const path = require( 'node:path' );
const token = require( path.resolve( __dirname, '../../../dist/lib/token.js' ) ).default;
token.get = async () => ( { valid: () => false } );
token.uuid = async () => 'startup-test';
process.getuid = () => 1000;

const load = Module._load;
Module._load = function ( request, parent, isMain ) {
	const resolved = Module._resolveFilename( request, parent, isMain ).replaceAll( '\\', '/' );
	if (
		/\/node_modules\/(?:@apollo\/client|undici|cli-table3|@json2csv)\//.test( resolved ) ||
		/\/dist\/lib\/(?:api\/client|analytics\/clients\/[^/]+)\.js$/.test( resolved )
	) {
		throw new Error( `Execution dependency loaded during help: ${ resolved }` );
	}
	return load.call( this, request, parent, isMain );
};
