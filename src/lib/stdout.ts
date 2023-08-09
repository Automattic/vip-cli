// eslint-disable-next-line @typescript-eslint/unbound-method
const originalWrite = process.stdout.write;

/**
 * Hooks into stdout so that we could see the output.
 *
 * This code has not been ported to modern standards as it's
 * not a trivial task to do so
 *
 * Based on https://gist.github.com/pguillory/729616
 *
 */
export function hookIntoStdout(
	callback: ( data: string, encoding: string, fd: number ) => unknown
): () => void {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	process.stdout.write = ( function ( write ) {
		return function ( string: never, encoding: never, fd: never ) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument,prefer-rest-params
			write.apply( process.stdout, arguments as never );
			callback( string, encoding, fd );
		};
		// eslint-disable-next-line @typescript-eslint/unbound-method
	} )( process.stdout.write ) as never;

	return function () {
		process.stdout.write = originalWrite;
	};
}
