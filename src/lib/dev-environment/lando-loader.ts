import { createRequire } from 'node:module';
const baseRequire = createRequire( __filename );

export function loadLandoModule< T = unknown >( request: string ): T {
	return baseRequire( request ) as T;
}

export function resolveLandoModule( request: string ): string {
	return baseRequire.resolve( request );
}
