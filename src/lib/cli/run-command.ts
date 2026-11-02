import { createRequire } from 'node:module';
import path from 'node:path';

const loadCommand = createRequire( __filename );
type CommandModule = { default?: Promise< unknown > };
type BundledCommands = Record< string, () => CommandModule >;

/** Load the selected command in this process, with its historical argv shape. */
export async function runCommand( filename: string, argv: string[] ): Promise< unknown > {
	const originalArgv = process.argv;
	process.argv = argv;
	try {
		// Commands export their execution promise so nested dispatch waits for all
		// middleware and handler work before restoring the caller's argv.
		const bundledCommands = (
			globalThis as typeof globalThis & { __VIP_BUNDLED_COMMANDS__?: BundledCommands }
		 ).__VIP_BUNDLED_COMMANDS__;
		const commandModule = bundledCommands
			? bundledCommands[ path.basename( filename ) ]?.()
			: ( loadCommand( filename ) as CommandModule );
		if ( ! commandModule ) {
			throw new Error( `Bundled command is unavailable: ${ filename }` );
		}
		if (
			commandModule.default === undefined ||
			commandModule.default === null ||
			typeof commandModule.default.then !== 'function'
		) {
			throw new Error( `Command module must export its execution promise: ${ filename }` );
		}
		return await commandModule.default;
	} finally {
		process.argv = originalArgv;
	}
}
