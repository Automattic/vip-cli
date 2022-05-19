/**
 * External dependencies
 */
import debugLib from 'debug';

const debug = debugLib( '@automattic/vip:lib:cli:config' );

let configFromFile = {};
try {
	// Get `local` config first; this will only exist in dev as it's npmignore-d.
	configFromFile = require( 'root/config/config.local.json' );

	debug( 'Loaded config data from config.local.json' );
} catch {
	// Fall back to `publish` config file.
	configFromFile = require( 'root/config/config.publish.json' );

	debug( 'Loaded config data from config.publish.json' );
}

const config = Object.assign( {}, configFromFile );

export default config;
