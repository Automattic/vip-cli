import { createRequire } from 'node:module';

import {
	getBundledResourceRoot,
	loadBundledPackage,
	resolveBundledModule,
} from '../cli/standalone-resources';

let baseRequire: NodeRequire | null = null;
const nodeRequire = (): NodeRequire => ( baseRequire ??= createRequire( __filename ) );

export function loadLandoModule< T = unknown >( request: string ): T {
	if ( getBundledResourceRoot() ) {
		return loadBundledPackage< T >( request );
	}
	return nodeRequire()( request ) as T;
}

export function resolveLandoModule( request: string ): string {
	if ( getBundledResourceRoot() ) {
		return resolveBundledModule( request );
	}
	return nodeRequire().resolve( request );
}
