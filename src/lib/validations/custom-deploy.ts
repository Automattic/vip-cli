import path from 'path';

import * as exit from '../../lib/cli/exit';

/**
 * Check if a file has a valid extension
 *
 * @param {string} filename The file extension
 * @returns {boolean} True if the extension is valid
 */
export function validateDeployFileExt( filename: string ): void {
	let ext = path.extname( filename ).toLowerCase();

	if ( ext === '.gz' && path.extname( path.basename( filename, ext ) ) === '.tar' ) {
		ext = '.tar.gz';
	}

	if ( ! [ '.zip', '.tar.gz', '.tgz' ].includes( ext ) ) {
		exit.withError( 'Invalid file extension. Please provide a .zip, .tar.gz, or a .tgz file.' );
	}
}

/**
 * Check if a file has a valid name
 * @param {string} filename The file name
 * @returns {boolean} True if the filename is valid
 */
export function validateFilename( filename: string ) {
	const re = /^[a-z0-9\-_.]+$/i;

	// Exits if filename contains anything outside a-z A-Z - _ .
	if ( ! re.test( filename ) ) {
		exit.withError(
			'Error: The characters used in the name of a file for custom deploys are limited to [0-9,a-z,A-Z,-,_,.]'
		);
	}
}
