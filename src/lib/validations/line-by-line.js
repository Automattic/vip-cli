/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import readline from 'readline';
import fs from 'fs';
import chalk from 'chalk';
import debugLib from 'debug';

/**
 * Internal dependencies
 */

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
}

function openFile( filename, flags = 'r', mode = 666 ) {
	return new Promise( ( resolve, reject ) => {
		fs.open( filename, flags, mode, ( err, fd ) => {
			if ( err ) {
				return reject( err );
			}
			resolve( fd );
		} );
	} );
}

export async function getReadInterface( filename: string ) {
	let fd;
	try {
		fd = await openFile( filename );
	} catch ( e ) {
		console.log( chalk.red( 'Error: ' ) + 'The file at the provided path is either missing or not readable.' );
		console.log( 'Please check the input and try again.' );
		process.exit( 1 );
	}

	return readline.createInterface( {
		input: fs.createReadStream( '', { fd } ),
		output: null,
		console: false,
	} );
}

export async function fileLineValidations( appId: number, envId: number, fileName: string, validations: Array<PerLineValidationObject> ) {
	const isImport = true;
	const readInterface = await getReadInterface( fileName );

	debug( 'Validations: ', validations );

	readInterface.on( 'line', line => {
		validations.map( validation => {
			validation.execute( line );
		} );
	} );

	readInterface.on( 'error', err => {
		throw new Error( ` Error validating input file: ${ err.toString() }` );
	} );

	// Block until the processing completes
	await new Promise( resolve => readInterface.on( 'close', resolve ) );
	readInterface.close();

	validations.map( async validation => {
		if ( validation.hasOwnProperty( 'postLineExecutionProcessing' ) && typeof validation.postLineExecutionProcessing === 'function' ) {
			await validation.postLineExecutionProcessing( { fileName, isImport, appId, envId } );
		}
	} );
};
