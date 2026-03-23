#!/usr/bin/env node

import { resolveInternalBinFromArgv, isSeaRuntime } from '../lib/cli/sea-dispatch';
import { prepareSeaRuntimeFilesystem } from '../lib/cli/sea-runtime';

const run = async () => {
	if ( isSeaRuntime() ) {
		process.env.VIP_CLI_SEA_MODE = '1';
		await prepareSeaRuntimeFilesystem();

		const resolution = resolveInternalBinFromArgv( process.argv );
		if ( resolution.bin !== 'vip' ) {
			process.env.VIP_CLI_TARGET_BIN = resolution.bin;
			process.env.VIP_CLI_TARGET_START = String( resolution.start );
			process.env.VIP_CLI_TARGET_LENGTH = String( resolution.length );
		}
	}

	await import( './vip.js' );
};

void run();
