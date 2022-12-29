/**
 * External dependencies
 */
import { spawn } from 'child_process';

/**
 * @typedef {Object} CliResult
 * @property {string} stdout
 * @property {string} stderr
 * @property {number} rc
 */
export class CliTest {
	/**
	 * @param {string[]} args Command and its arguments
	 * @param {Object} options Spawn options
	 * @param {boolean} printStderrOnError Whether to print stderr on error
	 * @returns {Promise<CliResult>} Return value of the command
	 */
	spawn( args, options, printStderrOnError ) {
		const [ command, ...commandArgs ] = args;

		let stdout = '', stderr = '', finished = false;

		return new Promise( ( resolve, reject ) => {
			const child = spawn( command, commandArgs, options );
			child.stdout.setEncoding( 'utf8' );
			child.stderr.setEncoding( 'utf8' );

			child.stdout.on( 'data', data => {
				stdout += '' + data;
			} );

			child.stderr.on( 'data', data => {
				stderr += '' + data;
			} );

			child.on( 'exit', code => {
				if ( ! finished ) {
					finished = true;
					const rc = code === null ? -1 : code;

					if ( rc && printStderrOnError ) {
						console.error( stderr );
					}

					resolve( { stdout, stderr, rc } );
				}
			} );

			child.on( 'error', err => {
				if ( ! finished ) {
					finished = true;
					reject( err );
				}
			} );
		} );
	}
}
