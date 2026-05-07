import { createRequire } from 'node:module';

type SeaModule = {
	isSea?: () => boolean;
};

const runtimeRequire = createRequire( __filename );

export function isStandaloneExecutableRuntime(): boolean {
	if ( process.env.VIP_CLI_SEA_MODE === '1' ) {
		return true;
	}

	try {
		const sea = runtimeRequire( 'node:sea' ) as SeaModule;
		return Boolean( sea?.isSea?.() );
	} catch {
		return false;
	}
}

export function getRuntimeModeLabel(): string {
	return isStandaloneExecutableRuntime() ? 'standalone-sea' : 'node-script';
}
