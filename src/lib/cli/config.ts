/**
 * External dependencies
 */
import debugLib from 'debug';

interface Config {
	tracksUserType: string;
	tracksAnonUserType: string;
	tracksEventPrefix: string;
	environment: string;
}

const debug = debugLib( '@automattic/vip:lib:cli:config' );

let configFromFile: Config;
try {
	// Get `local` config first; this will only exist in dev as it's npmignore-d.
	configFromFile = require( '../../../config/config.local.json' ) as Config;

	debug( 'Loaded config data from config.local.json' );
} catch {
	// Fall back to `publish` config file.
	configFromFile = require( '../../../config/config.publish.json' ) as Config;

	debug( 'Loaded config data from config.publish.json' );
}

export default configFromFile;
