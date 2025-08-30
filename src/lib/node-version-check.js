import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { satisfies } from 'semver';

const boldRed = process.stdout.isTTY ? '\x1b[1;31m' : '';
const reset = process.stdout.isTTY ? '\x1b[0m' : '';

try {
	const json = readFileSync( join( __dirname, '..', '..', 'package.json' ), 'utf8' );
	const { name, engines } = JSON.parse( json );

	const version = engines.node;

	if ( version && ! satisfies( process.version, version ) ) {
		console.warn(
			`${ boldRed }WARNING: The current version of Node (${ process.version }) does not meet the minimum requirements; ` +
				`${ name } requires Node version ${ version }.\n\n` +
				`Please follow the installation instructions at https://nodejs.org/en/download/ to upgrade.${ reset }\n`
		);
	}
} catch {
	// Do nothing
}
