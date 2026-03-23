import debugLib from 'debug';
import fs from 'node:fs'; // I don't like using synchronous versions, but until we migrate to ESM, we have to.
import path from 'node:path';

import defaultPublishConfig from '../../../config/config.publish.json';

interface Config {
	tracksUserType: string;
	tracksAnonUserType: string;
	tracksEventPrefix: string;
	environment: string;
}

const debug = debugLib( '@automattic/vip:lib:cli:config' );

export function loadConfigFile(): Config {
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
			if ( ! ( err instanceof Error ) || ! ( 'code' in err ) || err.code !== 'ENOENT' ) {
				debug( `Error reading config file at ${ filePath }:`, err );
			}
		}
	}

	return defaultPublishConfig as Config;
}

const configFromFile = loadConfigFile();
export default configFromFile;
