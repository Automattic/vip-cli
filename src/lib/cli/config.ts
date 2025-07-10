import debugLib from 'debug';
import { readFileSync, statSync } from 'node:fs'; // I don't like using synchronous versions, but until we migrate to ESM, we have to.
import path from 'node:path';

interface Config {
	tracksUserType: string;
	tracksAnonUserType: string;
	tracksEventPrefix: string;
	environment: string;
}

const debug = debugLib( '@automattic/vip:lib:cli:config' );

function loadConfigFile(): Config | null {
	const paths = [
		// Get `local` config first; this will only exist in dev as it's npmignore-d.
		path.join( __dirname, '../../../config/config.local.json' ),
		path.join( __dirname, '../../../config/config.publish.json' ),
	];

	for ( const filePath of paths ) {
		try {
			statSync( filePath );
			debug( `Found config file at ${ filePath }` );
			const data = readFileSync( filePath, 'utf-8' );
			return JSON.parse( data ) as Config;
		} catch ( err ) {
			if ( ! ( err instanceof Error ) || ! ( 'code' in err ) || err.code !== 'ENOENT' ) {
				debug( `Error reading config file at ${ filePath }:`, err );
			}
		}
	}

	return null;
}

const configFromFile = loadConfigFile();
if ( null === configFromFile ) {
	// This shouild not happen because `config/config.publish.json` is always present.
	console.error( 'FATAL ERROR: Could not find a valid configuration file' );
	process.exit( 1 );
}

// Without this, TypeScript will export `configFromFile` as `Config | null`
const exportedConfig: Config = configFromFile;
export default exportedConfig;
