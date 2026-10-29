// Isolate built-CLI tests from credentials, telemetry, networks, and Docker.
const childProcess = require( 'node:child_process' );
const path = require( 'node:path' );
const undici = require( 'undici' );
const tokenPath = path.resolve( __dirname, '../../../dist/lib/token.js' );
const token = require( tokenPath ).default;
token.get = async () => ( { valid: () => false } );
token.uuid = async () => 'single-process-test';

// Help checks must also work when the test runner itself is root. The root
// refusal is tested separately by explicitly restoring a zero uid.
process.getuid = () => 1000;

undici.fetch = () => {
	throw new Error( 'Unexpected network request in single-process CLI test' );
};

for ( const name of [ 'spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork' ] ) {
	childProcess[ name ] = () => {
		throw new Error( `Unexpected ${ name } in single-process CLI test` );
	};
}
