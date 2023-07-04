/**
 * External dependencies
 */
import { type Interface, createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import * as exit from '../../lib/cli/exit';

const debug = debugLib( 'vip:validations:line-by-line' );
export interface PerLineValidationObject {
	execute: Function;
	postLineExecutionProcessing?: ( params: PostLineExecutionProcessingParams ) => Promise< unknown >;
}

export interface PostLineExecutionProcessingParams {
	appId?: number;
	envId?: number;
	fileName?: string;
	isImport?: boolean;
	skipChecks?: string[];
	searchReplace?: string | string[];
}

export async function getReadInterface( filename: string ): Promise< Interface > {
	let fd;
	try {
		fd = await open( filename );
	} catch ( err ) {
		exit.withError(
			'The file at the provided path is either missing or not readable. Please check the input and try again.'
		);
	}

	return createInterface( {
		input: createReadStream( '', { fd } ),
		output: undefined,
	} );
}

export async function fileLineValidations(
	appId: number,
	envId: number,
	fileName: string,
	validations: PerLineValidationObject[],
	searchReplace: string | string[]
) {
	const isImport = true;
	const readInterface = await getReadInterface( fileName );

	debug( 'Validations: ', validations );

	readInterface.on( 'line', line => {
		validations.forEach( validation => {
			validation.execute( line );
		} );
	} );

	readInterface.on( 'error', ( err: Error ) => {
		throw new Error( ` Error validating input file: ${ err.toString() }` );
	} );

	// Block until the processing completes
	await new Promise( resolve => readInterface.on( 'close', resolve ) );
	readInterface.close();

	return Promise.all(
		validations.map( ( validation: PerLineValidationObject ) => {
			if (
				Object.prototype.hasOwnProperty.call( validation, 'postLineExecutionProcessing' ) &&
				typeof validation.postLineExecutionProcessing === 'function'
			) {
				return validation.postLineExecutionProcessing( {
					fileName,
					isImport,
					appId,
					envId,
					searchReplace,
				} );
			}

			return Promise.resolve();
		} )
	);
}
