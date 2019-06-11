/**
 * External dependencies
 */
import os from 'os';

/**
 * Internal dependencies
 */
import pkg from 'root/package.json';

const env = {
	app: {
		name: pkg.name,
		version: pkg.version,
	},

	os: {
		name: os.platform(),
		version: os.release(),
	},

	node: {
		version: process.version,
	},
};

env.userAgent = `vip-cli/${ pkg.version } (node/${ env.node.version }; ${ env.os.name }/${ env.os.version }; +https://vip.wordpress.com)`;

export default env;
