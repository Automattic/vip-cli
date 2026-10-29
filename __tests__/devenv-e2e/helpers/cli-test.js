import { spawn } from 'child_process';

/** Expand a canonical VIP command in the script position of a Node invocation. */
export function expandCliArgs( args ) {
	const [ command, script, ...rest ] = args;
	return Array.isArray( script ) ? [ command, ...script, ...rest ] : args;
}

/**
 * @typedef {Object} CliResult
 * @property {string} stdout Standard output
 * @property {string} stderr Standard error
 * @property {number} rc     Return code
 */
export class CliTest {
	/**
	 * @param {(string|string[])[]} args    Command and its arguments
	 * @param {Object}   options            Spawn options
	 * @param {boolean}  printStderrOnError Whether to print stderr on error
	 * @param {Object} control Cancellation options
	 * @param {number} [control.timeoutMs] Time before cancellation is requested
	 * @param {AbortSignal} [control.signal] Cancellation signal
	 * @return {Promise<CliResult>} Return value of the command
	 */
	spawn( args, options, printStderrOnError = false, control = {} ) {
		const [ command, ...commandArgs ] = expandCliArgs( args );

		let stdout = '';
		let stderr = '';
		return new Promise( ( resolve, reject ) => {
			if ( process.platform === 'win32' && ( control.signal || control.timeoutMs !== undefined ) ) {
				reject( new Error( 'Subprocess tree cancellation is not supported on Windows' ) );
				return;
			}
			if ( control.signal?.aborted ) {
				reject( new Error( 'CLI subprocess aborted' ) );
				return;
			}
			const ownGroup =
				process.platform !== 'win32' && ( control.signal || control.timeoutMs !== undefined );
			const child = spawn( command, commandArgs, {
				...options,
				...( ownGroup ? { detached: true } : {} ),
			} );
			let error;
			const terminate = signal => {
				if ( ! child.pid ) return;
				try {
					process.kill( -child.pid, signal );
				} catch ( err ) {
					if ( err.code !== 'ESRCH' ) throw err;
				}
			};
			const cancel = message => {
				if ( error ) return;
				error = new Error( message );
				terminate( 'SIGKILL' );
				child.stdout?.destroy();
				child.stderr?.destroy();
			};
			const abort = () => cancel( 'CLI subprocess aborted' );
			control.signal?.addEventListener( 'abort', abort, { once: true } );
			const timeout =
				control.timeoutMs === undefined
					? undefined
					: setTimeout(
							() => cancel( `CLI subprocess timed out after ${ control.timeoutMs }ms` ),
							control.timeoutMs
					  );
			child.stdout.setEncoding( 'utf8' );
			child.stderr.setEncoding( 'utf8' );

			child.stdout.on( 'data', data => {
				stdout += String( data );
			} );

			child.stderr.on( 'data', data => {
				stderr += String( data );
			} );

			child.on( 'error', err => {
				error = err;
			} );
			child.on( 'close', code => {
				clearTimeout( timeout );
				control.signal?.removeEventListener( 'abort', abort );
				if ( error ) return reject( error );
				const rc = code === null ? -1 : code;
				if ( rc && printStderrOnError ) console.error( stderr );
				resolve( { stdout, stderr, rc } );
			} );
		} );
	}
}
