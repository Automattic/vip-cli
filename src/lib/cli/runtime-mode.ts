type SeaModule = {
	isSea?: () => boolean;
};

export function isStandaloneExecutableRuntime(): boolean {
	if ( process.env.VIP_CLI_SEA_MODE === '1' ) {
		return true;
	}

	try {
		const sea = require( 'node:sea' ) as SeaModule;
		return Boolean( sea?.isSea?.() );
	} catch {
		return false;
	}
}

export function getRuntimeModeLabel(): string {
	return isStandaloneExecutableRuntime() ? 'standalone-sea' : 'node-script';
}
