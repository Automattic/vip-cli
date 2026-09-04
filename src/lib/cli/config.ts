import debugLib from 'debug';
import fs from 'node:fs'; // I don't like using synchronous versions, but until we migrate to ESM, we have to.
import path from 'node:path';

interface Config {
	tracksUserType: string;
	tracksAnonUserType: string;
	tracksEventPrefix: string;
	environment: string;
}

const debug = debugLib( '@automattic/vip:lib:cli:config' );

export function loadConfigFile(): Config | null {
	const paths = [
		// Get `local` config first; this will only exist in dev as it's npmignore-d.
		path.join( __dirname, '../../../config/config.local.json' ),
		path.join( __dirname, '../../../config/config.publish.json' ),
	];
	for ( const filePath of paths ) {
		try {
			const data = fs.readFileSync( filePath, 'utf-8' );
			debug( `Found config file at ${ filePath }` );
			return JSON.parse( data ) as Config;
		} catch ( err ) {
			const isEnoent = err instanceof Error && 'code' in err && err.code === 'ENOENT';
			if ( ! isEnoent ) {
				debug( `Error reading config file at ${ filePath }:`, err );
			}
		}
	}

	return null;
}

const configFromFile = loadConfigFile();
if ( null === configFromFile ) {
	console.error( 'FATAL ERROR: Could not find a valid configuration file' );
	process.exit( 1 );
}

// Without this, TypeScript will export `configFromFile` as `Config | null`.
const exportedConfig: Config = configFromFile;
export default exportedConfig;
