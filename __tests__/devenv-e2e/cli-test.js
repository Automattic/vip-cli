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
	 * @param {*} options Spawn options
	 * @returns {Promise<CliResult>} Return value of the command
	 */
	spawn( args, options ) {
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
					resolve( {
						stdout: stdout,
						stderr: stderr,
						rc: code === null ? -1 : code,
					} );
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
