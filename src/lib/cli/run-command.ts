import { createRequire } from 'node:module';

const loadCommand = createRequire( __filename );

/** Load the selected command in this process, with its historical argv shape. */
export async function runCommand( filename: string, argv: string[] ): Promise< unknown > {
	const originalArgv = process.argv;
	process.argv = argv;
	try {
		// Commands export their execution promise so nested dispatch waits for all
		// middleware and handler work before restoring the caller's argv.
		const commandModule = loadCommand( filename ) as { default?: Promise< unknown > };
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
