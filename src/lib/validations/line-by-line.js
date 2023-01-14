/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import readline from 'readline';
import fs from 'fs';
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import * as exit from '../../lib/cli/exit';

const debug = debugLib( 'vip:validations:line-by-line' );
export type PerLineValidationObject = {
	execute: Function,
	postLineExecutionProcessing?: Function,
};

export type PostLineExecutionProcessingParams = {
	appId?: number,
	envId?: number,
	fileName?: string,
	isImport?: boolean,
	skipChecks?: string[],
	searchReplace?: string | string[],
}

export async function getReadInterface( filename: string ) {
	let fd;
	try {
		fd = await fs.promises.open( filename );
	} catch ( err ) {
		exit.withError( 'The file at the provided path is either missing or not readable. Please check the input and try again.' );
	}

	return readline.createInterface( {
		input: fs.createReadStream( '', { fd } ),
		output: null,
		console: false,
	} );
}

export async function fileLineValidations( appId: number, envId: number, fileName: string, validations: Array<PerLineValidationObject>, searchReplace: string | string[] ) {
	const isImport = true;
	const readInterface = await getReadInterface( fileName );

	debug( 'Validations: ', validations );

	readInterface.on( 'line', line => {
		validations.forEach( validation => {
			validation.execute( line );
		} );
	} );

	readInterface.on( 'error', err => {
		throw new Error( ` Error validating input file: ${ err.toString() }` );
	} );

	// Block until the processing completes
	await new Promise( resolve => readInterface.on( 'close', resolve ) );
	readInterface.close();

	return Promise.all( validations.map( async validation => {
		if ( Object.prototype.hasOwnProperty.call( validation, 'postLineExecutionProcessing' ) && typeof validation.postLineExecutionProcessing === 'function' ) {
			return validation.postLineExecutionProcessing( { fileName, isImport, appId, envId, searchReplace } );
		}
	} ) );
}
