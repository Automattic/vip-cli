import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import pkg from '../../../package.json';
import { xdgData } from '../xdg-data';

const SEA_RUNTIME_DIR_NAME = 'sea-runtime';

let cachedRequire: NodeJS.Require | null = null;
let didResolveRequire = false;

function isSeaRuntime(): boolean {
	try {
		const sea = require( 'node:sea' ) as {
			isSea?: () => boolean;
		};
		return Boolean( sea?.isSea?.() );
	} catch {
		return false;
	}
}

function getSeaRuntimeNodeModulesPath(): string {
	return path.join( xdgData(), 'vip', SEA_RUNTIME_DIR_NAME, pkg.version, 'node_modules' );
}

function getRuntimeRequire(): NodeJS.Require {
	if ( didResolveRequire && cachedRequire ) {
		return cachedRequire;
	}

	didResolveRequire = true;

	if ( isSeaRuntime() ) {
		const runtimeNodeModulesPath = getSeaRuntimeNodeModulesPath();
		if ( existsSync( runtimeNodeModulesPath ) ) {
			const runtimeEntryPath = path.join( runtimeNodeModulesPath, '..', '__sea-entry__.js' );
			cachedRequire = createRequire( runtimeEntryPath );
			return cachedRequire;
		}
	}

	cachedRequire = require;
	return cachedRequire;
}

export function loadLandoModule< T = unknown >( request: string ): T {
	return getRuntimeRequire()( request ) as T;
}

export function resolveLandoModule( request: string ): string {
	return getRuntimeRequire().resolve( request );
}
