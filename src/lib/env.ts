import { arch, platform, release } from 'node:os';

import pkg from '../../package.json';

interface AppInfo {
	name: string;
	version: string;
}

interface OSInfo {
	name: string;
	version: string;
	arch: string;
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
	arch: arch(),
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
