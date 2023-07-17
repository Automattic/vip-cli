/**
 * External dependencies
 */
import { platform, release } from 'node:os';

/**
 * Internal dependencies
 */
import pkg from '../../package.json';

interface AppInfo {
	name: string;
	version: string;
}

interface OSInfo {
	name: string;
	version: string;
}

interface NodeInfo {
	version: string;
}

export interface Env {
	app: AppInfo;
	os: OSInfo;
	node: NodeInfo;
	userAgent: string;
}

const app: AppInfo = {
	name: pkg.name,
	version: pkg.version,
};

const os: OSInfo = {
	name: platform(),
	version: release(),
};

const node: NodeInfo = {
	version: process.version,
};

const env: Env = {
	app,
	os,
	node,
	userAgent: `vip-cli/${ app.version } (node/${ node.version }; ${ os.name }/${ os.version }; +https://wpvip.com)`,
};

export default env;
